import React from 'react';
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import VideosList from "@/pages/videos/index";
import VideosNew from "@/pages/videos/new";
import FeedConfig from "@/pages/feed";
import Widgets from "@/pages/widgets";
import CustomPages from "@/pages/custom-pages";
import Products from "@/pages/products";
import Comments from "@/pages/comments";
import Analytics from "@/pages/analytics";
import Integrations from "@/pages/integrations";
import Billing from "@/pages/billing";
import Settings from "@/pages/settings";
import PreviewFeed from "@/pages/preview/feed";
import PreviewProduct from "@/pages/preview/product";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/onboarding" component={Onboarding} />
      
      <Route path="/app" component={Dashboard} />
      <Route path="/app/videos" component={VideosList} />
      <Route path="/app/videos/new" component={VideosNew} />
      <Route path="/app/feed" component={FeedConfig} />
      <Route path="/app/widgets" component={Widgets} />
      <Route path="/app/pages" component={CustomPages} />
      <Route path="/app/products" component={Products} />
      <Route path="/app/comments" component={Comments} />
      <Route path="/app/analytics" component={Analytics} />
      <Route path="/app/integrations" component={Integrations} />
      <Route path="/app/billing" component={Billing} />
      <Route path="/app/settings" component={Settings} />
      
      <Route path="/preview/feed" component={PreviewFeed} />
      <Route path="/preview/product" component={PreviewProduct} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Ensure dark mode is set on html
  React.useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
