import React from "react";
import { Switch, Route, Redirect } from "wouter";

import { AuthRoute, ProtectedRoute } from "./ProtectedRoute";
import { isShopifyEmbeddedSession } from "@/lib/shopify-embedded";

// Every page is a lazy route-level chunk: the dashboard shell no longer
// downloads the whole app (nor shoppers the dashboard — /s/:slug/feed loads
// only the feed chunk inside the widget's iframe).
const Landing = React.lazy(() => import("@/pages/landing"));
const Login = React.lazy(() => import("@/pages/login"));
const Signup = React.lazy(() => import("@/pages/signup"));
const Onboarding = React.lazy(() => import("@/pages/onboarding"));
const Dashboard = React.lazy(() => import("@/pages/dashboard"));
const VideosList = React.lazy(() => import("@/pages/videos/index"));
const VideosNew = React.lazy(() => import("@/pages/videos/new"));
const FeedConfig = React.lazy(() => import("@/pages/feed"));
const Widgets = React.lazy(() => import("@/pages/widgets"));
const CustomPages = React.lazy(() => import("@/pages/custom-pages"));
const Products = React.lazy(() => import("@/pages/products"));
const Comments = React.lazy(() => import("@/pages/comments"));
const Feedbacks = React.lazy(() => import("@/pages/feedbacks"));
const Ordering = React.lazy(() => import("@/pages/ordering"));
const Integrations = React.lazy(() => import("@/pages/integrations"));
const Billing = React.lazy(() => import("@/pages/billing"));
const Settings = React.lazy(() => import("@/pages/settings"));
const AdminConsole = React.lazy(() => import("@/pages/admin"));
const AdminStore = React.lazy(() => import("@/pages/admin/store"));
const AdminAsaas = React.lazy(() => import("@/pages/admin/asaas"));
const AdminUsers = React.lazy(() => import("@/pages/admin/users"));
const PreviewFeed = React.lazy(() => import("@/pages/preview/feed"));
const PreviewProduct = React.lazy(() => import("@/pages/preview/product"));
const TestStore = React.lazy(() => import("@/pages/test-store"));
const NotFound = React.lazy(() => import("@/pages/not-found"));
const PrivacyPolicyPage = React.lazy(() =>
  import("@/pages/public-pages").then((m) => ({ default: m.PrivacyPolicyPage })),
);
const PublicSettingsPage = React.lazy(() =>
  import("@/pages/public-pages").then((m) => ({ default: m.PublicSettingsPage })),
);
const SupportPage = React.lazy(() =>
  import("@/pages/public-pages").then((m) => ({ default: m.SupportPage })),
);

function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-input border-t-primary" />
    </div>
  );
}

function RootRoute() {
  if (isShopifyEmbeddedSession()) {
    return (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    );
  }

  return <Landing />;
}

export function AppRoutes() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={RootRoute} />
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
        <Route path="/configuracoes" component={PublicSettingsPage} />
        <Route path="/privacidade" component={PrivacyPolicyPage} />
        <Route path="/suporte" component={SupportPage} />
        <Route path="/onboarding">
          <ProtectedRoute requireStore={false}>
            <Onboarding />
          </ProtectedRoute>
        </Route>

        <Route path="/app">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/app/videos">
          <ProtectedRoute>
            <VideosList />
          </ProtectedRoute>
        </Route>
        <Route path="/app/videos/new">
          <ProtectedRoute>
            <VideosNew />
          </ProtectedRoute>
        </Route>
        <Route path="/app/feed">
          <ProtectedRoute>
            <FeedConfig />
          </ProtectedRoute>
        </Route>
        <Route path="/app/widgets">
          <ProtectedRoute>
            <Widgets />
          </ProtectedRoute>
        </Route>
        <Route path="/app/pages">
          <ProtectedRoute>
            <CustomPages />
          </ProtectedRoute>
        </Route>
        <Route path="/app/products">
          <ProtectedRoute>
            <Products />
          </ProtectedRoute>
        </Route>
        <Route path="/app/comments">
          <ProtectedRoute>
            <Comments />
          </ProtectedRoute>
        </Route>
        <Route path="/app/feedbacks">
          <ProtectedRoute>
            <Feedbacks />
          </ProtectedRoute>
        </Route>
        <Route path="/app/ordering">
          <ProtectedRoute>
            <Ordering />
          </ProtectedRoute>
        </Route>
        <Route path="/app/integrations">
          <ProtectedRoute>
            <Integrations />
          </ProtectedRoute>
        </Route>
        <Route path="/app/billing">
          <ProtectedRoute>
            <Billing />
          </ProtectedRoute>
        </Route>
        <Route path="/app/settings">
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <AdminConsole />
        </Route>
        {/* Must precede /admin/:storeId — the param route would swallow it. */}
        <Route path="/admin/asaas">
          <AdminAsaas />
        </Route>
        <Route path="/admin/users">
          <AdminUsers />
        </Route>
        <Route path="/admin/:storeId">
          <AdminStore />
        </Route>
        {/* Old bookmarks: the console lived at /master before the rename. */}
        <Route path="/master">
          <Redirect to="/admin" replace />
        </Route>
        <Route path="/master/:storeId">
          {(params) => <Redirect to={`/admin/${params.storeId}`} replace />}
        </Route>

        <Route path="/preview/feed" component={PreviewFeed} />
        <Route path="/preview/product" component={PreviewProduct} />
        <Route path="/s/:storeSlug/feed" component={PreviewFeed} />
        <Route path="/test-store/:storeSlug" component={TestStore} />
        <Route path="/test-store/:storeSlug/produto-demo" component={TestStore} />

        <Route component={NotFound} />
      </Switch>
    </React.Suspense>
  );
}
