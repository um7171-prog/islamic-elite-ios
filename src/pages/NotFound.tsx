import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SEO } from "@/components/SEO";
import { useLocale } from "@/contexts/LocaleContext";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLocale();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted px-4" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <SEO
        title="الصفحة غير موجودة — 404"
        description="عذراً، الصفحة التي تبحث عنها غير موجودة. عد إلى الصفحة الرئيسية."
        path={location.pathname}
        noindex
      />
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("Oops! Page not found", "عذرًا! الصفحة غير موجودة")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("Return to Home", "العودة إلى الصفحة الرئيسية")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
