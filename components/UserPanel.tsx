import { User } from "lucide-react";
import { PanelCard } from "./PanelCard";

const userItems = [
  {
    title: "Moje wyniki",
    description: "Przeglądanie własnych wyników",
  },
  {
    title: "Moje zadania",
    description: "Lista przypisanych zadań",
  },
];

export function UserPanel() {
  return (
    <PanelCard
      icon={User}
      title="Panel Użytkownika"
      items={userItems}
      variant="user"
    />
  );
}
