/**
 * Domain types lokalne dla panelu serwisanta. Odbicia typów z root-libów
 * (`lib/service-annexes.ts`, `lib/service-photos.ts`, `lib/postal.ts`) —
 * tsconfig panela ma `paths: { "@/*": ["./*"] }`, więc importy z root nie
 * są dostępne. Przy zmianach kontraktu — zsynchronizuj ręcznie.
 */

export type AnnexAcceptanceMethod = "documenso" | "phone" | "email";
export type AnnexAcceptanceStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired";

export interface ServiceAnnex {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  deltaAmount: number;
  reason: string;
  acceptanceMethod: AnnexAcceptanceMethod;
  acceptanceStatus: AnnexAcceptanceStatus;
  documensoDocId: number | null;
  documensoSigningUrl: string | null;
  customerName: string | null;
  messageId: string | null;
  conversationId: number | null;
  note: string | null;
  pdfHash: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
}

export type ServicePhotoStage =
  | "intake"
  | "diagnosis"
  | "in_repair"
  | "before_delivery"
  | "other";

export interface ServicePhoto {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  storageKind: "directus" | "minio";
  storageRef: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  stage: ServicePhotoStage;
  note: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  filename: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  deletedAt: string | null;
}

export interface ChatwootConversationSummary {
  id: number;
  status: string;
  unreadCount: number;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  deepLink: string;
}

export interface PostalEmailMessage {
  id: number;
  token: string;
  status: string;
  rcptTo: string;
  mailFrom: string;
  subject: string;
  timestamp: number;
  spamScore?: number;
  bounce?: boolean;
}

export interface CommunicationResponse {
  chatwoot: ChatwootConversationSummary[];
  email: PostalEmailMessage[];
  meta?: {
    chatwootEnabled?: boolean;
    postalEnabled?: boolean;
    customerEmail?: string | null;
    customerPhone?: string | null;
  };
}
