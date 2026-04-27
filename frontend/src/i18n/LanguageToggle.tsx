import { useLanguage } from "./LanguageContext";

interface LanguageToggleProps {
  className?: string;
  size?: "sm" | "md";
}

export default function LanguageToggle({
  className = "",
  size = "sm",
}: LanguageToggleProps) {
  const { lang, setLang, t } = useLanguage();
  const isVi = lang === "vi";

  const padding = size === "sm" ? "px-1 py-0.5" : "px-1.5 py-1";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const segPad = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <div
      role="group"
      aria-label={t("lang.toggle.title")}
      title={t("lang.toggle.title")}
      className={`inline-flex items-center bg-gray-100 border border-gray-200 rounded-full ${padding} ${className}`}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={!isVi}
        className={`${segPad} ${textSize} font-semibold rounded-full transition-colors ${
          !isVi
            ? "bg-blue-600 text-white shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        {t("lang.en.short")}
      </button>
      <button
        type="button"
        onClick={() => setLang("vi")}
        aria-pressed={isVi}
        className={`${segPad} ${textSize} font-semibold rounded-full transition-colors ${
          isVi
            ? "bg-blue-600 text-white shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        {t("lang.vi.short")}
      </button>
    </div>
  );
}
