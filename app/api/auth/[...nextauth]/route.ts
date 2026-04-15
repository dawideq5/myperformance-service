import NextAuth from "next-auth";
import { getAuthOptions } from "@/app/auth";

let _handler: ReturnType<typeof NextAuth> | null = null;

function handler(...args: Parameters<ReturnType<typeof NextAuth>>) {
  if (!_handler) {
    _handler = NextAuth(getAuthOptions());
  }
  return _handler(...args);
}

export { handler as GET, handler as POST };
