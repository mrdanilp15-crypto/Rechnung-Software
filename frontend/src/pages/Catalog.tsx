import { useSearchParams } from "react-router-dom";
import Products from "./Products";
import Materials from "./Materials";
import Printers from "./Printers";
import Suppliers from "./Suppliers";

/** Katalog-Seiten (Produkte, Material, Drucker, Lieferanten) - erreichbar direkt über die Seitenleiste, daher ohne eigene Reiter. */
export default function Catalog() {
  const [params] = useSearchParams();
  const tabParam = params.get("tab");
  const tab = tabParam === "materials" || tabParam === "printers" || tabParam === "suppliers" ? tabParam : "products";

  return (
    <div>
      {tab === "products" ? <Products /> : tab === "materials" ? <Materials /> : tab === "printers" ? <Printers /> : <Suppliers />}
    </div>
  );
}
