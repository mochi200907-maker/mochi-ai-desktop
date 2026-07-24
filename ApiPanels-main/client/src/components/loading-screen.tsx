import { Progress } from "@/components/ui/progress";
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

interface LoadingScreenProps {
  onComplete?: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((oldProgress) => {
        if (oldProgress >= 100) {
          clearInterval(timer);
          if (onComplete) {
            setTimeout(() => onComplete(), 300);
          }
          return 100;
        }
        const diff = Math.random() * 30;
        return Math.min(oldProgress + diff, 100);
      });
    }, 200);

    return () => {
      clearInterval(timer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-[9999] transition-opacity duration-500" style={{ opacity: progress >= 100 ? 0 : 1 }}>
      <div className="w-full max-w-md px-6 space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center animate-pulse">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Loading API Dashboard
          </h2>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-center text-sm text-muted-foreground">
          Preparing your API experience...
        </p>
      </div>
    </div>
  );
}
