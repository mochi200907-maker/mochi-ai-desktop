import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Play, Copy, CheckCircle2, AlertCircle, Loader2, ExternalLink, Download } from "lucide-react";
import { APIEndpoint } from "@shared/api-schema";
import { useToast } from "@/hooks/use-toast";

interface APITestPanelProps {
  endpoint: APIEndpoint;
}

export function APITestPanel({ endpoint }: APITestPanelProps) {
  const [params, setParams] = useState<Record<string, string>>(endpoint.exampleValues || {});
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setParams(endpoint.exampleValues || {});
    setResponse(null);
    setError(null);
    setResponseTime(null);
    setStatusCode(null);
  }, [endpoint.id]);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setStatusCode(null);
    
    try {
      const queryParams = new URLSearchParams({
        endpoint: endpoint.endpoint,
        ...params,
      });

      const apiResponse = await fetch(`/api/proxy?${queryParams.toString()}`);
      const result = await apiResponse.json();

      if (!apiResponse.ok) {
        throw new Error(result.error || "API request failed");
      }

      setResponse(result.data);
      setResponseTime(result.responseTime);
      setStatusCode(result.status);
    } catch (err: any) {
      setError(err.message || "Failed to execute API call");
      console.error("API Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const buildCurlCommand = () => {
    const url = new URL(endpoint.endpoint, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    return `curl "${url.toString()}"`;
  };

  const buildJSCode = () => {
    const url = new URL(endpoint.endpoint, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    return `const response = await fetch('${url.toString()}');
const data = await response.json();
console.log(data);`;
  };

  // Helper to detect if response contains image URLs
  const extractImageUrls = (obj: any): string[] => {
    if (!obj) return [];
    const urls: string[] = [];
    
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (typeof item === "string" && (item.startsWith("http") && /\.(jpg|jpeg|png|gif|webp)/i.test(item))) {
          urls.push(item);
        }
      });
    } else if (typeof obj === "object") {
      if (obj.images && Array.isArray(obj.images)) {
        return obj.images.filter((url: any) => typeof url === "string");
      }
      if (obj.cover && typeof obj.cover === "string") {
        urls.push(obj.cover);
      }
      if (obj.thumbnail && typeof obj.thumbnail === "string") {
        urls.push(obj.thumbnail);
      }
    }
    
    return urls;
  };

  // Helper to detect video URLs
  const extractVideoUrl = (obj: any): string | null => {
    if (!obj) return null;
    if (typeof obj === "string" && obj.includes("video")) return obj;
    if (obj.videoUrl) return obj.videoUrl;
    if (obj.play) return obj.play;
    return null;
  };

  // Helper to detect audio/download URLs
  const extractDownloadUrl = (obj: any): string | null => {
    if (!obj) return null;
    if (obj.download_url) return obj.download_url;
    if (obj.downloadUrl) return obj.downloadUrl;
    return null;
  };

  const imageUrls = response ? extractImageUrls(response) : [];
  const videoUrl = response ? extractVideoUrl(response) : null;
  const downloadUrl = response ? extractDownloadUrl(response) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-2">
                <CardTitle className="text-xl sm:text-2xl">{endpoint.name}</CardTitle>
                <Badge variant="outline" className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30 w-fit">
                  {endpoint.category}
                </Badge>
              </div>
              <CardDescription className="text-sm sm:text-base">{endpoint.description}</CardDescription>
              <code className="mt-3 inline-block px-2 sm:px-3 py-1 bg-muted rounded-md text-xs sm:text-sm font-mono text-muted-foreground break-all">
                {endpoint.endpoint}
              </code>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Parameters</h3>
              {endpoint.parameters.map((param) => (
                <div key={param.name} className="space-y-2" data-testid={`input-group-${param.name}`}>
                  <Label htmlFor={param.name}>
                    {param.name}
                    {param.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    id={param.name}
                    type={param.type === "url" ? "url" : param.type === "number" ? "number" : "text"}
                    placeholder={param.placeholder}
                    value={params[param.name] || ""}
                    onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                    data-testid={`input-${param.name}`}
                  />
                  <p className="text-xs text-muted-foreground">{param.description}</p>
                </div>
              ))}
              <Button 
                onClick={handleExecute} 
                disabled={loading}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                data-testid="button-execute"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Execute
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Response</h3>
                <div className="flex items-center gap-2">
                  {responseTime && (
                    <Badge variant="secondary" className="text-xs">
                      {responseTime}ms
                    </Badge>
                  )}
                  {statusCode && (
                    <Badge 
                      variant={statusCode >= 200 && statusCode < 300 ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {statusCode}
                    </Badge>
                  )}
                </div>
              </div>

              {error && (
                <Card className="bg-destructive/10 border-destructive/30">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{error}</p>
                  </CardContent>
                </Card>
              )}

              {response && (
                <Card className="bg-card" data-testid="response-box">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-500">Success</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(response, null, 2))}
                        data-testid="button-copy-response"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {imageUrls.length > 0 && (
                      <div className="space-y-3 mb-4">
                        <p className="text-sm font-medium text-muted-foreground">Images:</p>
                        <div className="grid grid-cols-1 gap-3">
                          {imageUrls.map((img: string, idx: number) => (
                            <div key={idx} className="space-y-2">
                              <img 
                                src={img} 
                                alt={`Result ${idx + 1}`}
                                className="w-full rounded-md border border-border max-w-full h-auto"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <a 
                                href={img} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open image
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {videoUrl && (
                      <div className="mb-4 space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Video:</p>
                        <video 
                          controls 
                          className="w-full rounded-md border border-border max-w-full h-auto"
                          src={videoUrl}
                        />
                        <a 
                          href={videoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open video
                        </a>
                      </div>
                    )}

                    {downloadUrl && (
                      <div className="mb-4">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => window.open(downloadUrl, '_blank')}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download File
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">JSON Response:</p>
                      <pre className="bg-background p-2 sm:p-4 rounded-md overflow-x-auto text-xs font-mono border border-border max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(response, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!response && !error && (
                <Card className="bg-muted/30">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <p>Fill in the parameters and click Execute to test the API</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Code Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="curl">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="curl" data-testid="tab-curl">cURL</TabsTrigger>
              <TabsTrigger value="javascript" data-testid="tab-javascript">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-4">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => copyToClipboard(buildCurlCommand())}
                  data-testid="button-copy-curl"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <pre className="bg-background p-2 sm:p-4 rounded-md overflow-x-auto text-xs sm:text-sm font-mono border border-border whitespace-pre-wrap break-words">
                  {buildCurlCommand()}
                </pre>
              </div>
            </TabsContent>
            <TabsContent value="javascript" className="mt-4">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => copyToClipboard(buildJSCode())}
                  data-testid="button-copy-js"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <pre className="bg-background p-2 sm:p-4 rounded-md overflow-x-auto text-xs sm:text-sm font-mono border border-border whitespace-pre-wrap break-words">
                  {buildJSCode()}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
