"use client";

import { signIn } from "next-auth/react";
import { BarChart3 } from "lucide-react";

export default function LoginPage() {
  const handleLogin = async () => {
    console.log("=== SIGNIN ATTEMPT ===");
    try {
      const result = await signIn("keycloak", {
        callbackUrl: "/dashboard",
        redirect: false,
      });
      console.log("signIn result:", result);

      if (result?.ok && result?.url) {
        console.log("Redirecting to:", result.url);
        window.location.href = result.url;
      } else if (result?.error) {
        console.error("Signin error:", result.error);
      }
    } catch (error) {
      console.error("Exception:", error);
    }
    console.log("====================");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-purple-600/20 rounded-full p-4 mb-4">
              <BarChart3 className="w-12 h-12 text-purple-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">MyPerformance</h1>
            <p className="text-gray-400 text-center">Zaloguj się, aby uzyskać dostęp do dashboardu</p>
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Zaloguj przez Keycloak
          </button>

          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">
              System zarządzania wydajnością
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
