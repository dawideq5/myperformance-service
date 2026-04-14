import { Users } from "lucide-react";
import { PanelCard } from "./PanelCard";

const managerItems = [
  {
    title: "Raporty zespołu",
    description: "Przeglądanie wyników zespołu",
  },
  {
    title: "Przydzielanie zadań",
    description: "Zarządzanie zadaniami w zespole",
  },
];

export function ManagerPanel() {
  return (
    <PanelCard
      icon={Users}
      title="Panel Menedżera"
      items={managerItems}
      variant="manager"
    />
  );
}
