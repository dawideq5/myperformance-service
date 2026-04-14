import { Shield } from "lucide-react";
import { PanelCard } from "./PanelCard";

const adminItems = [
  {
    title: "Zarządzanie użytkownikami",
    description: "Pełny dostęp do zarządzania użytkownikami systemu",
  },
  {
    title: "Konfiguracja systemu",
    description: "Dostęp do ustawień globalnych systemu",
  },
];

export function AdminPanel() {
  return (
    <PanelCard
      icon={Shield}
      title="Panel Administratora"
      items={adminItems}
      variant="admin"
    />
  );
}
