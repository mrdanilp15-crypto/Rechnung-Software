import { useSearchParams } from "react-router-dom";
import Products from "./Products";
import Materials from "./Materials";

/** Katalog: verkaufte Produkte/Leistungen und das Material (Rohstoffe) an einem Ort, getrennt in zwei Reitern. */
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "materials" ? "materials" : "products";

  const tabButton = (key: "products" | "materials", label: string) => (
    <button
      onClick={() => setParams(key === "products" ? {} : { tab: key }, { replace: true })}
      className={`px-4 py-2 rounded text-sm ${tab === key ? "bg-brand text-white" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {tabButton("products", "Produkte und Leistungen")}
        {tabButton("materials", "Material (Lager)")}
      </div>
      {tab === "products" ? <Products /> : <Materials />}
    </div>
  );
}
