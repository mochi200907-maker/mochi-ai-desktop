import { StatsCard } from "@/components/stats-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Activity, Clock, Brain, Search, Download, Wrench, Video, Dice5, Palette, GraduationCap, Gamepad2, ArrowRight } from "lucide-react";
import { useAPIEndpoints } from "@/hooks/use-api-endpoints";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/loading-screen";
import { useState, useEffect } from "react";

const categoryIcons = {
  AI: Brain,
  Search: Search,
  Downloader: Download,
  Tools: Wrench,
  Video: Video,
  Random: Dice5,
  Canvas: Palette,
  Educational: GraduationCap,
  Entertainment: Gamepad2,
};

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const { endpoints: API_ENDPOINTS, isLoading: isLoadingAPIs } = useAPIEndpoints();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  const stats = {
    endpoints: API_ENDPOINTS.length,
    uptime: "99.9%",
    avgResponse: "~200ms",
  };

  return (
    <>
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      <div className={`transition-opacity duration-500 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
    <div className="p-6 lg:p-12 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-4">
        <div className="inline-block">
          <Badge className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-300">
            v1.0.0
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Norch REST API
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl">
          A powerful collection of APIs for developers. Test AI models, search services, and download tools with a beautiful interactive interface.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Button 
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600" 
            asChild 
            data-testid="button-explore"
            disabled={isLoadingAPIs || API_ENDPOINTS.length === 0}
          >
            <Link href={`/api/${API_ENDPOINTS[0]?.id || ''}`}>
              Explore APIs
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button variant="outline" asChild data-testid="button-documentation">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              Documentation
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard title="API Endpoints" value={`${stats.endpoints}+`} icon={Zap} gradient />
        <StatsCard title="Uptime" value={stats.uptime} icon={Activity} />
        <StatsCard title="Avg Response" value={stats.avgResponse} icon={Clock} />
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Featured APIs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {API_ENDPOINTS.map((endpoint) => {
            const Icon = categoryIcons[endpoint.category];
            return (
              <Link key={endpoint.id} href={`/api/${endpoint.id}`}>
                <Card className="hover-elevate active-elevate-2 cursor-pointer h-full transition-all" data-testid={`card-api-${endpoint.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-purple-400" />
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {endpoint.category}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{endpoint.name}</CardTitle>
                    <CardDescription className="text-sm line-clamp-2">
                      {endpoint.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-muted-foreground">
                      {endpoint.endpoint}
                    </code>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
        <CardContent className="p-8 text-center space-y-4">
          <h3 className="text-2xl font-bold">Built by April Manalo</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            All API responses include proper attribution. Thank you for using Norch REST API!
          </p>
          <div className="pt-2">
            <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
              author: "April Manalo"
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
      </div>
    </>
  );
}
