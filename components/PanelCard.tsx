import { LucideIcon } from "lucide-react";
import { memo } from "react";

interface PanelItem {
  title: string;
  description: string;
}

interface PanelCardProps {
  icon: LucideIcon;
  title: string;
  items: PanelItem[];
  variant: "admin" | "manager" | "user";
}

const variants = {
  admin: {
    container: "bg-purple-900/30 border-purple-700",
    icon: "text-purple-400",
    title: "text-purple-100",
    itemBg: "bg-purple-950/50",
    itemTitle: "text-purple-200",
    itemDesc: "text-purple-300",
  },
  manager: {
    container: "bg-blue-900/30 border-blue-700",
    icon: "text-blue-400",
    title: "text-blue-100",
    itemBg: "bg-blue-950/50",
    itemTitle: "text-blue-200",
    itemDesc: "text-blue-300",
  },
  user: {
    container: "bg-green-900/30 border-green-700",
    icon: "text-green-400",
    title: "text-green-100",
    itemBg: "bg-green-950/50",
    itemTitle: "text-green-200",
    itemDesc: "text-green-300",
  },
} as const;

export const PanelCard = memo(function PanelCard({
  icon: Icon,
  title,
  items,
  variant,
}: PanelCardProps) {
  const styles = variants[variant];

  return (
    <article
      className={`${styles.container} border rounded-lg p-6 transition-all duration-200 hover:shadow-lg hover:shadow-${variant}-900/20`}
      aria-label={title}
    >
      <header className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${styles.icon}`} aria-hidden="true" />
        <h2 className={`text-xl font-semibold ${styles.title}`}>{title}</h2>
      </header>

      <ul className="space-y-4" role="list">
        {items.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className={`${styles.itemBg} rounded p-4 transition-colors duration-150 hover:bg-opacity-70`}
          >
            <h3 className={`${styles.itemTitle} font-medium mb-1`}>
              {item.title}
            </h3>
            <p className={`${styles.itemDesc} text-sm`}>{item.description}</p>
          </li>
        ))}
      </ul>
    </article>
  );
});
