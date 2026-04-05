import { icons, type IconName } from "@/lib/icons";

export default function GameIcon({
  name,
  size = 24,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={icons[name]}
      alt={name}
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      draggable={false}
    />
  );
}
