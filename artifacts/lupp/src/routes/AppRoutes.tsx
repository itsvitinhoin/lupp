import { Switch, Route } from "wouter";
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
import TestStore from "@/pages/test-store";
import { AuthRoute, ProtectedRoute } from "./ProtectedRoute";

export function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login">
        <AuthRoute>
          <Login />
        </AuthRoute>
      </Route>
      <Route path="/signup">
        <AuthRoute>
          <Signup />
        </AuthRoute>
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute requireStore={false}>
          <Onboarding />
        </ProtectedRoute>
      </Route>

      <Route path="/app">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/app/videos">
        <ProtectedRoute><VideosList /></ProtectedRoute>
      </Route>
      <Route path="/app/videos/new">
        <ProtectedRoute><VideosNew /></ProtectedRoute>
      </Route>
      <Route path="/app/feed">
        <ProtectedRoute><FeedConfig /></ProtectedRoute>
      </Route>
      <Route path="/app/widgets">
        <ProtectedRoute><Widgets /></ProtectedRoute>
      </Route>
      <Route path="/app/pages">
        <ProtectedRoute><CustomPages /></ProtectedRoute>
      </Route>
      <Route path="/app/products">
        <ProtectedRoute><Products /></ProtectedRoute>
      </Route>
      <Route path="/app/comments">
        <ProtectedRoute><Comments /></ProtectedRoute>
      </Route>
      <Route path="/app/analytics">
        <ProtectedRoute><Analytics /></ProtectedRoute>
      </Route>
      <Route path="/app/integrations">
        <ProtectedRoute><Integrations /></ProtectedRoute>
      </Route>
      <Route path="/app/billing">
        <ProtectedRoute><Billing /></ProtectedRoute>
      </Route>
      <Route path="/app/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>

      <Route path="/preview/feed" component={PreviewFeed} />
      <Route path="/preview/product" component={PreviewProduct} />
      <Route path="/s/:storeSlug/feed" component={PreviewFeed} />
      <Route path="/test-store/:storeSlug" component={TestStore} />
      <Route path="/test-store/:storeSlug/produto-demo" component={TestStore} />

      <Route component={NotFound} />
    </Switch>
  );
}
