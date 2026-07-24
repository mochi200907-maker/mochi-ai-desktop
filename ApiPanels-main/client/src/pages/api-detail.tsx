import { useParams, useLocation } from "wouter";
import { useAPIEndpoints } from "@/hooks/use-api-endpoints";
import { APITestPanel } from "@/components/api-test-panel";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function APIDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { endpoints: API_ENDPOINTS, isLoading } = useAPIEndpoints();
  const endpoint = API_ENDPOINTS.find((api) => api.id === params.id);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-12 max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-purple-500 mx-auto animate-spin" />
          <p className="text-muted-foreground">Loading API details...</p>
        </div>
      </div>
    );
  }

  if (!endpoint) {
    return (
      <div className="p-6 lg:p-12 max-w-4xl mx-auto">
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="p-12 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold text-destructive">API Not Found</h2>
            <p className="text-muted-foreground">
              The API endpoint you're looking for doesn't exist.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-12 max-w-7xl mx-auto">
      <APITestPanel endpoint={endpoint} />
    </div>
  );
}
