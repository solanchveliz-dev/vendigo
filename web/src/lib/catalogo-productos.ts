// Tipos de producto sugeridos por rubro para publicar tocando opciones (igual que en el prototipo).
// Cada tipo trae sus opciones más comunes: tallas, colores, material, presentación, etc.

export type Dim = { k: string; label: string; type: "multi" | "one" | "color"; opts: string[]; def: string[] };
export type TipoProducto = { id: string; n: string; prices: number[]; dims: Dim[]; nameWord?: string; mine?: boolean };

export const RUBROS_PUBLICAR = [
  { id: "moda", n: "Moda" },
  { id: "belleza", n: "Belleza" },
  { id: "hogar", n: "Hogar" },
  { id: "tecnologia", n: "Tecnología" },
  { id: "alimentos", n: "Alimentos" },
  { id: "artesanias", n: "Artesanías" },
  { id: "deportes", n: "Deportes" },
];

// Rubro de la tienda → catálogo sugerido
export function rubroPublicar(rubroTienda: string) {
  const m: Record<string, string> = { moda: "moda", accesorios: "artesanias", belleza: "belleza", comida: "alimentos", hogar: "hogar", tecnologia: "tecnologia", artesania: "artesanias", mascotas: "hogar", otros: "artesanias" };
  return m[rubroTienda] ?? "artesanias";
}

const TALLAS: Record<string, string[]> = {
  ropa: ["XS", "S", "M", "L", "XL", "XXL"],
  calzado: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44"],
  anillo: ["6", "7", "8", "9", "Ajustable"],
  unica: ["Talla única"],
};

export const COLORES: [string, string][] = [
  ["Negro", "#1D1D1F"], ["Blanco", "#FFFFFF"], ["Gris", "#9AA0A6"], ["Azul marino", "#1F2F55"], ["Celeste", "#8EC5FF"], ["Rojo", "#D23B3B"], ["Rosado", "#F2A7C3"],
  ["Verde", "#2E7D4F"], ["Beige", "#E3D3B8"], ["Marrón", "#7A5236"], ["Mostaza", "#D7A12C"], ["Morado", "#7B4FA0"], ["Dorado", "#C9A44C"], ["Plateado", "#C9CDD2"],
];

const talla = (set: string, def: string[] = []): Dim => ({ k: "talla", label: set === "calzado" ? "Tallas (calzado)" : set === "anillo" ? "Medida" : "Tallas", type: "multi", opts: TALLAS[set], def });
const color = (def: string[] = []): Dim => ({ k: "color", label: "Colores disponibles", type: "color", opts: [], def });
const one = (k: string, label: string, opts: string[], def?: string): Dim => ({ k, label, type: "one", opts, def: [def ?? opts[0]] });
const multi = (k: string, label: string, opts: string[], def?: string[]): Dim => ({ k, label, type: "multi", opts, def: def ?? [opts[0]] });
const T = (id: string, n: string, prices: number[], dims: Dim[], extra: Partial<TipoProducto> = {}): TipoProducto => ({ id, n, prices, dims, ...extra });

export const CATALOGO: Record<string, TipoProducto[]> = {
  moda: [
    T("polo", "Polo", [39, 49, 59, 79], [talla("ropa", ["S", "M", "L"]), color(["Negro", "Blanco"]), one("mat", "Material", ["Algodón pima", "Algodón", "Poliéster", "Lino"])]),
    T("casaca", "Casaca", [99, 129, 159, 199], [talla("ropa", ["S", "M", "L"]), color(["Azul marino"]), one("mat", "Material", ["Denim", "Drill", "Polar", "Cuero sintético"])]),
    T("camisa", "Camisa", [59, 79, 99], [talla("ropa", ["S", "M", "L"]), color(["Celeste", "Blanco"]), one("mat", "Material", ["Algodón", "Lino", "Popelina"])]),
    T("vestido", "Vestido", [69, 89, 119], [talla("ropa", ["S", "M"]), color(["Negro"]), one("mat", "Estilo", ["Casual", "De fiesta", "Playero"])]),
    T("pantalon", "Pantalón", [69, 89, 119], [talla("ropa", ["S", "M", "L"]), color(["Azul marino"]), one("mat", "Tipo", ["Jean", "Drill", "Jogger", "Palazzo"])]),
    T("zapatillas", "Zapatillas", [119, 159, 199], [talla("calzado", ["37", "38", "39", "40"]), color(["Blanco"])]),
    T("sombrero", "Sombrero", [39, 59, 79], [talla("unica", ["Talla única"]), color(["Beige"])]),
    T("mochila", "Mochila", [69, 99, 129], [color(["Beige", "Negro"]), one("mat", "Material", ["Lona", "Cuero sintético", "Yute"])]),
  ],
  belleza: [
    T("serum", "Sérum", [49, 69, 89], [multi("pres", "Presentación", ["15 ml", "30 ml", "50 ml"], ["30 ml"]), one("mat", "Para", ["Todo tipo de piel", "Piel grasa", "Piel seca"])], { nameWord: "para" }),
    T("crema", "Crema hidratante", [39, 59, 79], [multi("pres", "Presentación", ["50 g", "100 g", "200 g"], ["50 g"]), one("mat", "Para", ["Rostro", "Cuerpo", "Manos"])], { nameWord: "para" }),
    T("aceite", "Aceite corporal", [35, 49, 65], [multi("pres", "Presentación", ["60 ml", "120 ml"], ["120 ml"]), one("mat", "Aroma", ["Almendras", "Coco", "Lavanda"])]),
    T("perfume", "Perfume", [79, 119, 159], [multi("pres", "Presentación", ["30 ml", "50 ml", "100 ml"], ["50 ml"]), one("mat", "Tipo", ["Floral", "Cítrico", "Amaderado"])]),
    T("labial", "Labial", [25, 35, 45], [color(["Rojo", "Rosado"]), one("mat", "Acabado", ["Mate", "Brillante", "Satinado"])]),
  ],
  hogar: [
    T("vela", "Vela aromática", [25, 35, 49], [multi("pres", "Tamaño", ["Pequeña", "Mediana", "Grande"], ["Mediana"]), one("mat", "Aroma", ["Almendras", "Lavanda", "Vainilla", "Canela"])]),
    T("bata", "Bata de baño", [69, 89, 119], [talla("ropa", ["S", "M", "L"]), color(["Gris", "Blanco"]), one("mat", "Material", ["Algodón", "Toalla", "Polar"])]),
    T("taza", "Taza", [19, 29, 39], [color(["Blanco"]), one("mat", "Material", ["Cerámica", "Vidrio", "Enlozada"])]),
    T("cojin", "Cojín", [29, 39, 55], [color(["Beige", "Mostaza"]), one("mat", "Tela", ["Lino", "Terciopelo", "Algodón"])]),
    T("canasta", "Canasta", [39, 59, 79], [one("mat", "Contenido", ["Verduras orgánicas", "Frutas", "Mixta"])], { nameWord: "de" }),
  ],
  tecnologia: [
    T("smartwatch", "Smartwatch", [99, 149, 199], [color(["Negro", "Gris"]), one("mat", "Uso", ["Deportivo", "Clásico"])], { nameWord: "" }),
    T("reloj", "Reloj inteligente", [89, 129, 169], [color(["Negro"])]),
    T("audifonos", "Audífonos", [59, 89, 129], [color(["Negro", "Blanco"]), one("mat", "Tipo", ["Inalámbricos", "Con cable", "Deportivos"])], { nameWord: "" }),
    T("cargador", "Cargador", [29, 45, 59], [multi("pres", "Potencia", ["20 W", "25 W", "45 W"], ["25 W"]), one("mat", "Conector", ["USB-C", "Lightning", "Micro USB"])]),
    T("funda", "Funda de celular", [19, 29, 39], [color(["Negro"]), one("mat", "Modelo", ["iPhone", "Samsung", "Xiaomi", "Motorola"])], { nameWord: "para" }),
  ],
  alimentos: [
    T("pancakes", "Pancakes", [22, 28, 35], [multi("pres", "Presentación", ["x6", "x12"], ["x6"]), one("mat", "Con", ["Frutos rojos", "Miel", "Manjar"])], { nameWord: "con" }),
    T("plato", "Arroz con pollo", [18, 25, 38], [multi("pres", "Porción", ["Personal", "Familiar"], ["Personal"])]),
    T("sandwich", "Sándwiches", [25, 35, 45], [multi("pres", "Presentación", ["x6", "x12", "x24"], ["x6"]), one("mat", "Tipo", ["Triples", "De pollo", "Mixtos"])], { nameWord: "" }),
    T("alfajores", "Alfajores", [18, 28, 45], [multi("pres", "Presentación", ["x6", "x12", "x24"], ["x12"]), one("mat", "Sabor", ["Maicena", "Chocolate", "Lúcuma"])], { nameWord: "de" }),
    T("cafe", "Café", [25, 38, 49], [multi("pres", "Presentación", ["250 g", "500 g", "1 kg"], ["250 g"]), one("mat", "Molienda", ["En grano", "Molido"])], { nameWord: "" }),
  ],
  artesanias: [
    T("aretes", "Aretes", [29, 45, 59], [color(["Plateado"]), one("mat", "Material", ["Plata 950", "Baño de oro", "Alpaca", "Hilo encerado"])]),
    T("collar", "Collar", [39, 59, 79], [color(["Plateado"]), one("mat", "Material", ["Plata 950", "Baño de oro", "Hilo encerado"])]),
    T("anillo", "Anillo", [25, 39, 55], [talla("anillo", ["Ajustable"]), one("mat", "Material", ["Plata 950", "Baño de oro", "Alpaca"])]),
    T("pulsera", "Pulsera", [15, 22, 35], [color(["Rojo"]), one("mat", "Material", ["Hilo encerado", "Plata 950", "Mostacillas"])]),
    T("bolso", "Bolso tejido", [49, 69, 99], [color(["Beige"]), one("mat", "Material", ["Yute", "Totora", "Lana de alpaca"])]),
  ],
  deportes: [
    T("zapatillas", "Zapatillas", [129, 169, 219], [talla("calzado", ["38", "39", "40", "41"]), color(["Blanco"]), one("mat", "Para", ["Running", "Trail", "Gimnasio"])], { nameWord: "" }),
    T("ropa", "Polo deportivo", [39, 55, 69], [talla("ropa", ["S", "M", "L"]), color(["Negro"]), one("mat", "Tela", ["Dry-fit", "Algodón"])]),
    T("mat", "Mat de yoga", [69, 95, 129], [color(["Morado"]), multi("pres", "Grosor", ["4 mm", "6 mm", "8 mm"], ["6 mm"])]),
    T("botella", "Botella térmica", [35, 55, 69], [color(["Negro"]), multi("pres", "Capacidad", ["500 ml", "750 ml", "1 L"], ["750 ml"])]),
  ],
};

export const CARACTERISTICAS: Record<string, string[]> = {
  polo: ["Cuello redondo", "Cuello V", "Manga corta", "Manga larga", "Estampado", "Unisex", "Oversize"],
  casaca: ["Oversize", "Con capucha", "Botones metálicos", "Forro interior", "Impermeable", "Unisex"],
  camisa: ["Manga larga", "Manga corta", "Slim fit", "Con bolsillo", "Unisex"],
  vestido: ["Largo", "Corto", "Con tirantes", "Manga corta", "Con cierre"],
  pantalon: ["Tiro alto", "Tiro medio", "Con bolsillos", "Elástico", "Recto", "Pitillo"],
  zapatillas: ["Suela antideslizante", "Plantilla acolchada", "Transpirable", "Con pasadores", "Liviana"],
  sombrero: ["Ala ancha", "Protección solar", "Unisex", "Ajustable"],
  mochila: ["Bolsillo para laptop", "Impermeable", "Cierre de seguridad", "Varios bolsillos"],
  serum: ["Vitamina C", "Ácido hialurónico", "Sin parabenos", "Vegano", "Libre de crueldad"],
  crema: ["Hidratación 24 h", "Sin fragancia", "Vegano", "Con aloe vera"],
  aceite: ["100% natural", "Prensado en frío", "Vegano"],
  perfume: ["Larga duración", "Unisex", "Hecho en Perú"],
  labial: ["Larga duración", "Hidratante", "Vegano"],
  vela: ["Cera de soya", "Mecha de algodón", "30 h de duración", "Frasco reutilizable"],
  bata: ["Con bolsillos", "Con capucha", "Unisex", "Con cinturón"],
  taza: ["Apta para microondas", "Pintada a mano", "Personalizable", "350 ml"],
  cojin: ["Funda lavable", "Con relleno", "40 × 40 cm", "Bordado a mano"],
  canasta: ["Productos de temporada", "Orgánico", "Para 2 personas", "Para 4 personas"],
  smartwatch: ["Resistente al agua", "Mide ritmo cardiaco", "Bluetooth", "Batería 7 días", "Garantía 6 meses"],
  reloj: ["Resistente al agua", "Bluetooth", "Garantía 6 meses"],
  audifonos: ["Bluetooth 5.3", "Cancelación de ruido", "Con micrófono", "Batería 20 h", "Garantía 6 meses"],
  cargador: ["Carga rápida", "Incluye cable", "Garantía 6 meses"],
  funda: ["Antigolpes", "Transparente", "Con soporte", "Magnética"],
  pancakes: ["Recién hechos", "Sin preservantes", "Para compartir", "Delivery el mismo día"],
  plato: ["Recién hecho", "Incluye ensalada", "Para llevar"],
  sandwich: ["Recién hechos", "Pan artesanal", "Para eventos"],
  alfajores: ["Sin preservantes", "En caja de regalo", "Recién horneados", "Manjar casero"],
  cafe: ["De Villa Rica", "100% arábica", "Tostado medio", "Orgánico"],
  aretes: ["Hecho a mano", "Hipoalergénico", "En cajita de regalo", "Liviano"],
  collar: ["Hecho a mano", "Ajustable", "En cajita de regalo"],
  anillo: ["Hecho a mano", "Ajustable", "Hipoalergénico"],
  pulsera: ["Hecho a mano", "Ajustable", "Protección"],
  bolso: ["Hecho a mano", "Con forro", "Asa larga"],
  ropa: ["Secado rápido", "Transpirable", "Unisex"],
  mat: ["Antideslizante", "Con correa", "Ecológico", "183 × 61 cm"],
  botella: ["Frío 24 h / calor 12 h", "Acero inoxidable", "Libre de BPA"],
};

export const DATOS_FICHA: Record<string, string[]> = {
  audifonos: ["Bluetooth", "Batería", "Carga", "Resistencia", "Garantía", "Incluye"], smartwatch: ["Pantalla", "Batería", "Resistencia", "Compatible con", "Garantía", "Incluye"],
  reloj: ["Pantalla", "Batería", "Resistencia", "Garantía", "Incluye"], cargador: ["Potencia", "Cable", "Compatible con", "Garantía", "Incluye"], funda: ["Modelo", "Material", "Protección"],
  polo: ["Medidas", "Cuidado", "Hecho en"], casaca: ["Medidas", "Forro", "Cuidado", "Hecho en"], camisa: ["Medidas", "Cuidado", "Hecho en"], vestido: ["Largo", "Cuidado", "Hecho en"], pantalon: ["Medidas", "Cuidado", "Hecho en"],
  zapatillas: ["Suela", "Peso", "Hecho en"], mochila: ["Medidas", "Capacidad", "Incluye"], sombrero: ["Medidas", "Cuidado"],
  serum: ["Ingredientes", "Modo de uso", "Contenido", "Vence"], crema: ["Ingredientes", "Modo de uso", "Contenido", "Vence"], aceite: ["Ingredientes", "Modo de uso", "Contenido"], perfume: ["Notas", "Duración", "Contenido"], labial: ["Contenido", "Duración", "Vence"],
  vela: ["Medidas", "Peso", "Duración"], bata: ["Medidas", "Cuidado"], taza: ["Capacidad", "Medidas", "Cuidado"], cojin: ["Medidas", "Relleno", "Cuidado"], canasta: ["Peso aprox.", "Incluye", "Duración"],
  pancakes: ["Ingredientes", "Duración", "Alérgenos", "Entrega"], plato: ["Ingredientes", "Porción", "Entrega"], sandwich: ["Ingredientes", "Duración", "Entrega"], alfajores: ["Ingredientes", "Peso", "Duración", "Alérgenos"], cafe: ["Origen", "Altura", "Notas", "Tueste"],
  aretes: ["Medidas", "Peso", "Cierre", "Incluye"], collar: ["Largo", "Dije", "Cierre", "Incluye"], anillo: ["Medida", "Ancho", "Incluye"], pulsera: ["Largo", "Cierre"], bolso: ["Medidas", "Asa", "Forro"],
  ropa: ["Medidas", "Cuidado"], mat: ["Medidas", "Peso", "Material"], botella: ["Capacidad", "Medidas", "Material"], otro: ["Medidas", "Material", "Garantía", "Incluye"],
};

// Opciones listas para "Crear el mío"
export const GRUPOS_SUGERIDOS: [string, string[]][] = [
  ["Talla", ["S", "M", "L"]], ["Color", []], ["Tamaño", ["Pequeño", "Mediano", "Grande"]], ["Sabor", []], ["Presentación", []], ["Material", []], ["Modelo", []], ["Aroma", []],
];

// Lee una ficha pegada: "Clave: valor", "Clave<tab>valor" o líneas alternadas (clave / valor).
export function leerFicha(txt: string): [string, string][] {
  const lineas = txt.split(/\r?\n/).map((l) => l.replace(/^[•\-*·]\s*/, "").trim()).filter(Boolean);
  const out: [string, string][] = [];
  if (lineas.some((l) => /[:\t]| - /.test(l))) {
    for (const l of lineas) {
      const m = l.split(/\t|:\s*| - /);
      if (m.length >= 2 && m[0].trim() && m.slice(1).join(" ").trim()) out.push([m[0].trim(), m.slice(1).join(" ").trim()]);
    }
  } else for (let i = 0; i + 1 < lineas.length; i += 2) out.push([lineas[i], lineas[i + 1]]);
  return out.slice(0, 15);
}
