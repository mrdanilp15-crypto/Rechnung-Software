import { useSearchParams } from "react-router-dom";
import Products from "./Products";
import Materials from "./Materials";
import Printers from "./Printers";
import Suppliers from "./Suppliers";

/** Katalog: verkaufte Produkte/Leistungen, Material (Rohstoffe) und Drucker an einem Ort, getrennt in Reitern. */
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab = tabParam === "materials" || tabParam === "printers" || tabParam === "suppliers" ? tabParam : "products";

  const tabButton = (key: "products" | "materials" | "printers" | "suppliers", label: string) => (
    <button
      onClick={() => setParams(key === "products" ? {} : { tab: key }, { replace: true })}
      className={`px-4 py-2 rounded text-sm ${tab === key ? "bg-brand text-white" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {tabButton("products", "Produkte und Leistungen")}
        {tabButton("materials", "Material (Lager)")}
        {tabButton("printers", "Drucker")}
        {tabButton("suppliers", "Lieferanten")}
      </div>
      {tab === "products" ? <Products /> : tab === "materials" ? <Materials /> : tab === "printers" ? <Printers /> : <Suppliers />}
    </div>
  );
}
