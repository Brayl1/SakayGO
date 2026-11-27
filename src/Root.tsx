import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";
import { Info } from "lucide-react";
import Navigation from "./Navigation";
import { CatalogProvider, useCatalog } from "./CatalogContext";
import CatalogPlanner, { CatalogDirectory, CatalogDetail } from "./Catalog";
const KaSakay = lazy(() => import("./KaSakay"));
const Admin = lazy(() => import("./Admin"));
const Guide = lazy(() => import("./Guide"));
const TripPlanner = lazy(() => import("./TripPlanner"));
const Welcome = lazy(() => import("./Welcome"));
const CodeResearch = lazy(() => import("./CodeResearch"));
const VerificationAdmin = lazy(() => import("./VerificationAdmin"));
function Shell() {
  const { data, admin, sessionError } = useCatalog();
  const location = useLocation();
  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <Navigation admin={admin} />
      {location.pathname !== "/" && (
        <div className="demo-banner">
          <Info size={15} />
          <span>
            <strong>
              CDO route information
            </strong>{" "}
            ·{" "}
            Route previews are approximate. Confirm service, boarding and fares with your driver.
          </span>
          <Link to="/about">
            Data notes →
          </Link>
        </div>
      )}
      {data.settings.announcement && (
        <motion.div
          className="site-announcement"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="status"
        >
          {data.settings.announcement}
        </motion.div>
      )}
      {sessionError && <div className="planner-error" role="alert">{sessionError}</div>}
      <main id="main">
        <Suspense
          fallback={
            <div className="content-page" role="status">
              Loading SakayGo…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/kasakay" element={<KaSakay />} />
            <Route path="/planner" element={<TripPlanner />} />
            <Route path="/network" element={<CatalogPlanner />} />
            <Route path="/codes" element={<CodeResearch />} />
            <Route path="/explore" element={<CatalogDirectory />} />
            <Route path="/routes/:id" element={<CatalogDetail />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/verification" element={<VerificationAdmin />} />
            <Route path="/demo" element={<Navigate to="/planner" replace />} />
            <Route path="/results" element={<Navigate to="/planner" replace />} />
            <Route path="/fares" element={<Guide page="fares" />} />
            <Route path="/how-it-works" element={<Guide page="how" />} />
            <Route path="/about" element={<Guide page="about" />} />
            <Route
              path="*"
              element={
                <div className="content-page">
                  <h1>This route leads nowhere.</h1>
                  <Link className="primary" to="/">
                    Back to SakayGo
                  </Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}
export default function Root() {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <CatalogProvider>
        <Shell />
      </CatalogProvider>
    </MotionConfig>
  );
}

