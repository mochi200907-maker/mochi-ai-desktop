import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  gradient?: boolean;
}

export function StatsCard({ title, value, icon: Icon, gradient }: StatsCardProps) {
  return (
    <Card className={gradient ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20" : ""} data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-md flex items-center justify-center ${
            gradient 
              ? "bg-gradient-to-br from-purple-500 to-pink-500" 
              : "bg-accent"
          }`}>
            <Icon className={`w-6 h-6 ${gradient ? "text-white" : "text-accent-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
