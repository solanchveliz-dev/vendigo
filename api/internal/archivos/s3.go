package archivos

import (
	"bytes"
	"context"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
)

// S3 guarda las imágenes en Amazon S3 (o MinIO en local).
// Las subidas se hacen con URLs firmadas: el archivo va directo al bucket sin pasar por la API.
type S3 struct {
	cliente *s3.Client
	firma   *s3.PresignClient
	publico string
	privado string
	baseURL string
}

const (
	duracionSubida  = 5 * time.Minute
	duracionLectura = 10 * time.Minute
)

func Nuevo(ctx context.Context, c config.Config) (*S3, error) {
	opts := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(c.S3Region)}
	if c.S3AccessKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(c.S3AccessKey, c.S3SecretKey, "")))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, err
	}
	cli := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if c.S3Endpoint != "" {
			o.BaseEndpoint = aws.String(c.S3Endpoint)
			o.UsePathStyle = true
		}
	})
	return &S3{
		cliente: cli,
		firma:   s3.NewPresignClient(cli),
		publico: c.BucketPublico,
		privado: c.BucketPrivado,
		baseURL: c.MediaPublicURL,
	}, nil
}

func (s *S3) bucket(publico bool) string {
	if publico {
		return s.publico
	}
	return s.privado
}

func (s *S3) URLSubida(ctx context.Context, publico bool, key, contentType string, tamano int64) (string, error) {
	req, err := s.firma.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket(publico)),
		Key:           aws.String(key),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(tamano),
	}, s3.WithPresignExpires(duracionSubida))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (s *S3) URLLectura(ctx context.Context, key string) (string, error) {
	req, err := s.firma.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.privado),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(duracionLectura))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (s *S3) URLPublica(key string) string {
	if key == "" {
		return ""
	}
	return s.baseURL + "/" + key
}

func (s *S3) Existe(ctx context.Context, publico bool, key string) bool {
	_, err := s.cliente.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket(publico)), Key: aws.String(key)})
	return err == nil
}

// Subir guarda un archivo directamente (lo usan los datos de prueba).
func (s *S3) Subir(ctx context.Context, publico bool, key, contentType string, data []byte) error {
	_, err := s.cliente.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket(publico)),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
		Body:        bytes.NewReader(data),
	})
	return err
}

// Leer descarga un archivo (lo usa la IA para analizar fotos y boletas).
func (s *S3) Leer(ctx context.Context, publico bool, key string) ([]byte, string, error) {
	out, err := s.cliente.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket(publico)), Key: aws.String(key)})
	if err != nil {
		return nil, "", err
	}
	defer out.Body.Close()
	data, err := io.ReadAll(io.LimitReader(out.Body, 6<<20))
	return data, aws.ToString(out.ContentType), err
}
