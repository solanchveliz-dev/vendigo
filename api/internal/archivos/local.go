package archivos

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// PrepararLocal crea los buckets si no existen y deja el público con lectura abierta.
// Solo se usa en local (S3 compatible con docker compose). En AWS los buckets los crea Terraform.
func (s *S3) PrepararLocal(ctx context.Context) error {
	var errs []error
	for _, b := range []string{s.publico, s.privado} {
		if b == "" {
			continue
		}
		if _, err := s.cliente.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(b)}); err == nil {
			continue
		}
		if _, err := s.cliente.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(b)}); err != nil {
			errs = append(errs, fmt.Errorf("crear bucket %s: %w", b, err))
		}
	}
	if s.publico != "" {
		politica := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}`, s.publico)
		if _, err := s.cliente.PutBucketPolicy(ctx, &s3.PutBucketPolicyInput{Bucket: aws.String(s.publico), Policy: aws.String(politica)}); err != nil {
			errs = append(errs, fmt.Errorf("lectura pública en %s: %w", s.publico, err))
		}
	}
	return errors.Join(errs...)
}