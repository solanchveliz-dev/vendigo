package productos

import "testing"

func TestPrecioConOferta(t *testing.T) {
	if p := PrecioConOferta(4500, 20); p != 3600 {
		t.Errorf("4500 con 20%%: %d", p)
	}
	if p := PrecioConOferta(3999, 15); p != 3390 {
		t.Errorf("3999 con 15%%: %d", p)
	}
}

func TestValidarProducto(t *testing.T) {
	d := datosProducto{Nombre: "Polo", Precio: 3500, Imagenes: []string{"producto/t1/a.jpg"},
		Variantes: []Variante{{Nombre: "S", Stock: 2}, {Nombre: "M", Stock: 3}}}
	if err := d.validar("t1"); err != nil {
		t.Fatal(err)
	}
	if d.Stock != 5 {
		t.Errorf("el stock debe ser la suma de las variantes: %d", d.Stock)
	}
	ajena := datosProducto{Nombre: "Polo", Precio: 3500, Imagenes: []string{"producto/otra/a.jpg"}}
	if ajena.validar("t1") == nil {
		t.Error("no debe aceptar fotos de otra tienda")
	}
	repetida := datosProducto{Nombre: "Polo", Precio: 3500, Imagenes: []string{"producto/t1/a.jpg"},
		Variantes: []Variante{{Nombre: "S"}, {Nombre: "s"}}}
	if repetida.validar("t1") == nil {
		t.Error("no debe aceptar variantes repetidas")
	}
}
