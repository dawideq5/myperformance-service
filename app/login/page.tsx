"use client";

import { signIn } from "next-auth/react";
import { BarChart3, AlertCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLogin = async () => {
    try {
      console.log("Attempting to sign in with Keycloak...");
      await signIn("keycloak", {
        callbackUrl: "/dashboard",
      });
    } catch (error) {
      console.error("Login error:", error);
      alert("Wystąpił błąd podczas logowania. Sprawdź konsolę.");
    }
  };

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case "OAuthCallback":
        return "Błąd callback OAuth - NEXTAUTH_URL jest ustawione na localhost zamiast na produkcyjny URL";
      case "OAuthSignin":
        return "Błąd podczas inicjalizacji logowania OAuth";
      case "OAuthAccountNotLinked":
        return "To konto nie jest połączone z OAuth";
      case "OAuthCreateAccount":
        return "Błąd podczas tworzenia konta OAuth";
      case "SessionRequired":
        return "Wymagana sesja";
      case "Configuration":
        return "Błąd konfiguracji NextAuth";
      default:
        return error ? `Wystąpił błąd: ${error}` : null;
    }
  };

  const errorMessage = getErrorMessage(error);

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

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{errorMessage}</p>
            </div>
          )}

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
