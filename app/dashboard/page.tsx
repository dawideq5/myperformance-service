import { auth } from "@/app/auth";
import { redirect } from "next/navigation";
import { RoleGuard } from "@/components/RoleGuard";
import { AdminPanel } from "@/components/AdminPanel";
import { ManagerPanel } from "@/components/ManagerPanel";
import { UserPanel } from "@/components/UserPanel";
import { PerformanceChart } from "@/components/PerformanceChart";
import { TasksChart } from "@/components/TasksChart";
import { LogOut, BarChart3 } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <nav className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-8 h-8 text-purple-500" />
              <span className="text-xl font-bold text-white">MyPerformance</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-300">{session.user.name}</span>
              <a
                href="/api/auth/signout"
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Wyloguj
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Dashboard</h1>

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PerformanceChart />
            <TasksChart />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RoleGuard
              roles={["admin"]}
              userRoles={session.user.roles}
              fallback={<div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-gray-400">Brak dostępu</div>}
            >
              <AdminPanel />
            </RoleGuard>

            <RoleGuard
              roles={["manager"]}
              userRoles={session.user.roles}
              fallback={<div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-gray-400">Brak dostępu</div>}
            >
              <ManagerPanel />
            </RoleGuard>

            <RoleGuard
              roles={["user"]}
              userRoles={session.user.roles}
              fallback={<div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-gray-400">Brak dostępu</div>}
            >
              <UserPanel />
            </RoleGuard>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Informacje o użytkowniku</h3>
            <div className="space-y-2 text-gray-300">
              <p><strong>Email:</strong> {session.user.email}</p>
              <p><strong>Nazwa:</strong> {session.user.name}</p>
              <p><strong>Role:</strong> {session.user.roles?.join(", ") || "Brak ról"}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
