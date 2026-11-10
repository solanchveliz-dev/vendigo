package ia

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

// Proveedor es el modelo de IA que analiza imágenes y texto.
type Proveedor interface {
	Preguntar(ctx context.Context, instruccion string, imagen []byte, formato string) (string, error)
}

// ---------- Amazon Bedrock ----------

type Bedrock struct {
	cliente *bedrockruntime.Client
	modelo  string
}

func NuevoBedrock(ctx context.Context, region, modelo string) (*Bedrock, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, err
	}
	return &Bedrock{cliente: bedrockruntime.NewFromConfig(cfg), modelo: modelo}, nil
}

func (b *Bedrock) Preguntar(ctx context.Context, instruccion string, imagen []byte, formato string) (string, error) {
	contenido := []types.ContentBlock{}
	if len(imagen) > 0 {
		f := types.ImageFormatJpeg
		switch formato {
		case "image/png":
			f = types.ImageFormatPng
		case "image/webp":
			f = types.ImageFormatWebp
		}
		contenido = append(contenido, &types.ContentBlockMemberImage{Value: types.ImageBlock{
			Format: f, Source: &types.ImageSourceMemberBytes{Value: imagen},
		}})
	}
	contenido = append(contenido, &types.ContentBlockMemberText{Value: instruccion})
	out, err := b.cliente.Converse(ctx, &bedrockruntime.ConverseInput{
		ModelId:         aws.String(b.modelo),
		Messages:        []types.Message{{Role: types.ConversationRoleUser, Content: contenido}},
		InferenceConfig: &types.InferenceConfiguration{MaxTokens: aws.Int32(900), Temperature: aws.Float32(0.3)},
	})
	if err != nil {
		return "", err
	}
	msg, ok := out.Output.(*types.ConverseOutputMemberMessage)
	if !ok || len(msg.Value.Content) == 0 {
		return "", errors.New("respuesta vacía del modelo")
	}
	if t, ok := msg.Value.Content[0].(*types.ContentBlockMemberText); ok {
		return t.Value, nil
	}
	return "", errors.New("respuesta sin texto")
}

// ---------- Simulado (desarrollo, sin costo) ----------

type Simulado struct{}

func (Simulado) Preguntar(_ context.Context, instruccion string, imagen []byte, _ string) (string, error) {
	switch {
	case strings.Contains(instruccion, "PRODUCTO"):
		return `{"nombre":"Aretes de plata con piedra natural","descripcion":"Aretes livianos hechos a mano en plata, con una piedra natural al centro. Ideales para uso diario o para regalar.","categoria":"Aretes","caracteristicas":["Plata 950","Hechos a mano","Cierre de presión"]}`, nil
	}
	return "", fmt.Errorf("instrucción no reconocida")
}

// extraerJSON toma el primer objeto JSON de la respuesta del modelo.
func extraerJSON(texto string, destino any) error {
	i, j := strings.Index(texto, "{"), strings.LastIndex(texto, "}")
	if i < 0 || j <= i {
		return errors.New("la IA no devolvió datos")
	}
	return json.Unmarshal([]byte(texto[i:j+1]), destino)
}
