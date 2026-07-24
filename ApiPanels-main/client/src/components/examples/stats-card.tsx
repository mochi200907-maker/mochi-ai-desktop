import { StatsCard } from "../stats-card";
import { Zap, Activity, Clock } from "lucide-react";

export default function StatsCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      <StatsCard title="API Endpoints" value="8+" icon={Zap} gradient />
      <StatsCard title="Uptime" value="99.9%" icon={Activity} />
      <StatsCard title="Avg Response" value="~200ms" icon={Clock} />
    </div>
  );
}
