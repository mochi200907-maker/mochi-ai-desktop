import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Brain, Search, Download, Wrench, Video, Dice5, Palette, GraduationCap, Gamepad2, Zap, ChevronDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAPIEndpoints } from "@/hooks/use-api-endpoints";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

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

const categories = ["AI", "Search", "Downloader", "Tools", "Video", "Random", "Canvas", "Educational", "Entertainment"] as const;

export function AppSidebar() {
  const [location] = useLocation();
  const { setOpenMobile } = useSidebar();
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const { endpoints: API_ENDPOINTS, isLoading } = useAPIEndpoints();

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  if (isLoading) {
    return (
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Loading...</h1>
            </div>
          </div>
        </SidebarHeader>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="p-6">
        <Link href="/" data-testid="link-home">
          <div className="flex items-center gap-3 cursor-pointer hover-elevate active-elevate-2 p-3 rounded-md -m-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Norch REST API</h1>
              <p className="text-xs text-muted-foreground">by April Manalo</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {categories.map((category) => {
          const Icon = categoryIcons[category];
          const endpoints = API_ENDPOINTS.filter((api) => api.category === category);
          
          
          return (
            <Collapsible
              key={category}
              open={openCategories[category]}
              onOpenChange={() => toggleCategory(category)}
            >
              <SidebarGroup>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md px-2 py-1.5 transition-colors">
                    <Icon className="w-4 h-4" />
                    <span className="flex-1">{category}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${openCategories[category] ? 'rotate-0' : '-rotate-90'}`} />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {endpoints.map((endpoint) => {
                        const isActive = location === `/api/${endpoint.id}`;
                        return (
                          <SidebarMenuItem key={endpoint.id}>
                            <SidebarMenuButton asChild data-active={isActive} data-testid={`link-api-${endpoint.id}`}>
                              <Link href={`/api/${endpoint.id}`} onClick={() => setOpenMobile(false)}>
                                <span className={isActive ? "font-semibold" : ""}>{endpoint.name}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
