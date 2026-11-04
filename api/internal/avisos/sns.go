package avisos

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sns/types"
)

// SNS envía los códigos de verificación por SMS con Amazon SNS.
type SNS struct{ cliente *sns.Client }

func NuevoSNS(ctx context.Context, region string) (*SNS, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, err
	}
	return &SNS{cliente: sns.NewFromConfig(cfg)}, nil
}

func (s *SNS) EnviarCodigo(ctx context.Context, celular, codigo string) error {
	_, err := s.cliente.Publish(ctx, &sns.PublishInput{
		PhoneNumber: aws.String("+51" + celular),
		Message:     aws.String(fmt.Sprintf("VendiGo: tu código es %s. Vence en 10 minutos. No lo compartas con nadie.", codigo)),
		MessageAttributes: map[string]types.MessageAttributeValue{
			"AWS.SNS.SMS.SMSType": {DataType: aws.String("String"), StringValue: aws.String("Transactional")},
		},
	})
	return err
}
