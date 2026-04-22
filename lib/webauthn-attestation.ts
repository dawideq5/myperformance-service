/**
 * Minimalny parser WebAuthn attestationObject — wyciąga credentialPublicKey
 * w formacie jakiego wymaga Keycloak (CBOR-encoded COSE key, base64).
 *
 * attestationObject (CBOR, base64url):
 *   {
 *     "fmt":      <string>,          # np. "none", "packed", "fido-u2f"
 *     "attStmt":  <map>,              # zależny od fmt, często puste dla "none"
 *     "authData": <bytes>             # to z tego wyciągamy pubkey
 *   }
 *
 * authData (bytes):
 *   [0..31]    rpIdHash                 32 bytes
 *   [32]       flags                     1 byte
 *   [33..36]   signCount                 4 bytes (big-endian)
 *   --- jeśli AT flag (0x40) ustawiony ---
 *   [37..52]   aaguid                    16 bytes
 *   [53..54]   credentialIdLength        2 bytes (big-endian)
 *   [55..(55+credIdLen-1)] credentialId
 *   [(55+credIdLen)..]     credentialPublicKey (CBOR-encoded COSE key)
 *
 * Zero dependencji, no CBOR library.
 */

function base64urlToBuffer(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

/**
 * Przeskakuje jedną wartość CBOR (Generic, by ominąć nieinteresujące pola
 * jak "fmt" i "attStmt" przed "authData"). Zwraca nowy offset.
 */
function skipCborValue(bytes: Buffer, offset: number): number {
  if (offset >= bytes.length) throw new Error("CBOR: out of bounds");
  const firstByte = bytes[offset];
  const majorType = firstByte >> 5;
  const addInfo = firstByte & 0x1f;
  offset += 1;

  const readLen = (): number => {
    if (addInfo < 24) return addInfo;
    if (addInfo === 24) {
      const v = bytes[offset];
      offset += 1;
      return v;
    }
    if (addInfo === 25) {
      const v = bytes.readUInt16BE(offset);
      offset += 2;
      return v;
    }
    if (addInfo === 26) {
      const v = bytes.readUInt32BE(offset);
      offset += 4;
      return v;
    }
    throw new Error(`CBOR: unsupported length encoding ${addInfo}`);
  };

  switch (majorType) {
    case 0: // unsigned int
    case 1: // negative int
    case 7: // simple/float
      readLen();
      return offset;
    case 2: // byte string
    case 3: {
      // text string
      const len = readLen();
      return offset + len;
    }
    case 4: {
      // array
      const len = readLen();
      for (let i = 0; i < len; i++) offset = skipCborValue(bytes, offset);
      return offset;
    }
    case 5: {
      // map
      const len = readLen();
      for (let i = 0; i < len; i++) {
        offset = skipCborValue(bytes, offset); // key
        offset = skipCborValue(bytes, offset); // value
      }
      return offset;
    }
    case 6: {
      // tagged
      readLen(); // tag
      return skipCborValue(bytes, offset);
    }
    default:
      throw new Error(`CBOR: unsupported major type ${majorType}`);
  }
}

function readCborTextString(bytes: Buffer, offset: number): { value: string; next: number } {
  const firstByte = bytes[offset];
  const majorType = firstByte >> 5;
  const addInfo = firstByte & 0x1f;
  if (majorType !== 3) throw new Error(`Expected CBOR text string, got major ${majorType}`);
  offset += 1;
  let len: number;
  if (addInfo < 24) len = addInfo;
  else if (addInfo === 24) { len = bytes[offset]; offset += 1; }
  else if (addInfo === 25) { len = bytes.readUInt16BE(offset); offset += 2; }
  else if (addInfo === 26) { len = bytes.readUInt32BE(offset); offset += 4; }
  else throw new Error(`Text string length encoding ${addInfo} unsupported`);
  const value = bytes.slice(offset, offset + len).toString("utf-8");
  return { value, next: offset + len };
}

function readCborByteString(bytes: Buffer, offset: number): { value: Buffer; next: number } {
  const firstByte = bytes[offset];
  const majorType = firstByte >> 5;
  const addInfo = firstByte & 0x1f;
  if (majorType !== 2) throw new Error(`Expected CBOR byte string, got major ${majorType}`);
  offset += 1;
  let len: number;
  if (addInfo < 24) len = addInfo;
  else if (addInfo === 24) { len = bytes[offset]; offset += 1; }
  else if (addInfo === 25) { len = bytes.readUInt16BE(offset); offset += 2; }
  else if (addInfo === 26) { len = bytes.readUInt32BE(offset); offset += 4; }
  else throw new Error(`Byte string length encoding ${addInfo} unsupported`);
  return { value: bytes.slice(offset, offset + len), next: offset + len };
}

export interface AttestationData {
  /** 16-bajtowy aaguid w formacie "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx". */
  aaguid: string;
  /** credentialId w base64 (nie base64url). */
  credentialIdBase64: string;
  /**
   * CBOR-encoded COSE public key w base64 (format akceptowany przez
   * Keycloak WebAuthnCredentialProvider).
   */
  credentialPublicKeyBase64: string;
  /** Kopia całego authData w base64 — dla debugu. */
  authDataBase64: string;
  /** Format attestation (z CBOR: "fmt"). */
  fmt: string;
  /** Licznik podpisów z authData. */
  signCount: number;
  /** Flagi authData (UP/UV/AT/ED). */
  flags: number;
}

/**
 * Dekoduje attestationObject, wyciąga pola wymagane przez Keycloak.
 */
export function parseAttestationObject(base64urlAttestation: string): AttestationData {
  const bytes = base64urlToBuffer(base64urlAttestation);
  if (bytes.length === 0) throw new Error("Empty attestationObject");

  // Root: CBOR map
  const firstByte = bytes[0];
  const rootMajorType = firstByte >> 5;
  const rootAddInfo = firstByte & 0x1f;
  if (rootMajorType !== 5) {
    throw new Error(`Expected CBOR map at root, got major ${rootMajorType}`);
  }
  let offset = 1;
  let entries: number;
  if (rootAddInfo < 24) entries = rootAddInfo;
  else if (rootAddInfo === 24) { entries = bytes[offset]; offset += 1; }
  else if (rootAddInfo === 25) { entries = bytes.readUInt16BE(offset); offset += 2; }
  else throw new Error(`Root map length encoding ${rootAddInfo} unsupported`);

  let authData: Buffer | null = null;
  let fmt = "none";

  for (let i = 0; i < entries; i++) {
    const { value: key, next: afterKey } = readCborTextString(bytes, offset);
    offset = afterKey;
    if (key === "authData") {
      const { value, next } = readCborByteString(bytes, offset);
      authData = value;
      offset = next;
    } else if (key === "fmt") {
      const { value, next } = readCborTextString(bytes, offset);
      fmt = value;
      offset = next;
    } else {
      // skip unknown entry
      offset = skipCborValue(bytes, offset);
    }
  }

  if (!authData) throw new Error("authData missing in attestationObject");
  if (authData.length < 37) throw new Error("authData too short");

  const flags = authData[32];
  const signCount = authData.readUInt32BE(33);

  // AT flag (0x40) → attested credential data present
  if (!(flags & 0x40)) {
    throw new Error("authData missing attested credential data (AT flag not set)");
  }
  if (authData.length < 55) throw new Error("authData too short for attested credential data");

  const aaguidBytes = authData.slice(37, 53);
  const hex = Array.from(aaguidBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const aaguid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

  const credIdLen = authData.readUInt16BE(53);
  const credIdEnd = 55 + credIdLen;
  if (authData.length < credIdEnd) {
    throw new Error("authData too short for credentialId");
  }
  const credentialIdBytes = authData.slice(55, credIdEnd);

  // Public key = reszta authData (CBOR-encoded COSE key)
  const publicKeyBytes = authData.slice(credIdEnd);
  if (publicKeyBytes.length === 0) {
    throw new Error("authData missing credentialPublicKey");
  }

  return {
    aaguid,
    credentialIdBase64: credentialIdBytes.toString("base64"),
    credentialPublicKeyBase64: publicKeyBytes.toString("base64"),
    authDataBase64: authData.toString("base64"),
    fmt,
    signCount,
    flags,
  };
}
