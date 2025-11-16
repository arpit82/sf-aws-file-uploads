Salesforce → Amazon S3 Direct File Upload (Production Architecture)

A production-ready pattern where Salesforce orchestrates the workflow while the browser uploads files directly to Amazon S3 using short-lived presigned URLs generated via AWS Lambda, API Gateway, and Salesforce Named Credentials.

📘 Table of Contents

Overview

Architecture Diagram

Repo Structure

Prerequisites

AWS Setup

1. Create S3 Bucket

2. Configure IAM Role

3. Lambda Setup

4. API Gateway Setup

5. Usage Plan + API Key

Salesforce Setup

1. External Credential

2. Permission Set Mapping

3. Named Credential

4. CSP Trusted Sites

5. Deploy Apex

6. Deploy LWC

Testing

Troubleshooting

Security Notes

Appendix

Overview

This implementation enables:

Direct browser → Amazon S3 uploads

Zero Apex binary handling

Secure AWS-side presigned URL generation

Progress bar upload from LWC

API Gateway authentication via Salesforce External Credential

Core AWS Services:

Amazon S3

AWS Lambda (Python + boto3)

Amazon API Gateway (REST)

IAM (least-privilege prefix policies)

Core Salesforce Components:

Named Credential

External Credential

Apex Orchestration Layer

LWC with XHR Upload

Architecture Diagram

(Add diagram image here)

Repo Structure
.
├── apex/
│   ├── S3PresignService.cls
│   ├── S3Uploader.cls
│   └── S3FileController.cls
│
├── lwc/awsFileUploader/
│   ├── awsFileUploader.html
│   ├── awsFileUploader.js
│   ├── awsFileUploader.js-meta.xml
│   └── awsFileUploader.css
│
├── lambda/generate-presigned-url/
│   ├── lambda_function.py
│   └── requirements.txt
│
├── s3/
│   ├── cors.json
│   └── bucket-policy.json
│
└── README.md

Prerequisites
✅ AWS

Access to S3, IAM, Lambda, API Gateway

AWS CLI configured (optional)

✅ Salesforce

Admin access

Ability to deploy Apex + LWC

Permission Set creation rights

AWS Setup
1. Create S3 Bucket

AWS Console → S3 → Create Bucket

OR via CLI:

aws s3 mb s3://<BUCKET_NAME> --region <REGION>

Apply CORS

Add s3/cors.json:

aws s3api put-bucket-cors \
  --bucket <BUCKET_NAME> \
  --cors-configuration file://s3/cors.json

2. Configure IAM Role

Create IAM role for Lambda.

Attach policy:

{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/salesforce/uploads/*"
    }
  ]
}


Attach additional policy:
AWSLambdaBasicExecutionRole

3. Lambda Setup

Runtime: Python 3.9+

Handler: lambda_function.lambda_handler

Code: Provided in lambda/lambda_function.py

Set environment variable:

ALLOWED_BUCKETS = <BUCKET_NAME>

Test Event
{
  "body": "{\"bucket\":\"<BUCKET_NAME>\",\"key\":\"salesforce/uploads/test.txt\",\"content_type\":\"text/plain\"}"
}

4. API Gateway Setup

Create REST API → POST /generate-presigned

Integration: Lambda Proxy Integration

Require API Key

Deploy to stage (Dev, Prod, etc.)

Copy Invoke URL:

https://<API_ID>.execute-api.<REGION>.amazonaws.com/<STAGE>

5. Usage Plan + API Key

Create Usage Plan

Set throttling / quota

Attach stage

Create API Key

Link API Key → Usage Plan

This API Key will go into Salesforce External Credential.

Salesforce Setup
1. External Credential

Setup → External Credentials → New

Name: Presign_API_EC

Auth Parameter:

Name: APIKey

Type: Header

Header Name: x-api-key

Value: <API_KEY>

2. Permission Set Mapping

Create Permission Set: Presign_API_Permissions

Assign to users who need the integration.

In External Credential → Permission Set Mappings → New Mapping

3. Named Credential

Setup → Named Credentials → New

Name: Presign_API_NC

URL:

https://<API_ID>.execute-api.<REGION>.amazonaws.com/<STAGE>


Authentication Protocol: Custom

External Credential: Presign_API_EC

4. CSP Trusted Sites

Add:

https://<BUCKET_NAME>.s3.amazonaws.com


And Experience Cloud URL if used.

5. Deploy Apex

Deploy files:

S3PresignService.cls

S3Uploader.cls

S3FileController.cls

Confirm endpoint:

callout:Presign_API_NC/generate-presigned

6. Deploy LWC

Deploy awsFileUploader folder.

Add component to Record Page or App Page.

Testing
1. Test Lambda

Use Test JSON.

2. Test API Gateway
curl -X POST "<INVOKE_URL>/generate-presigned" \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -d '{"bucket":"<BUCKET>","key":"salesforce/uploads/test.txt"}'

3. Test Named Credential

Run in Developer Console:

new S3PresignService().generatePresignedUrl(...);

4. Test LWC

Upload file & watch Network tab:

Presign request → 200

PUT request → 200

Troubleshooting
❌ 403 Forbidden (API Gateway)

Stage not linked to Usage Plan

API Key not injected

Wrong Named Credential endpoint

❌ CORS error

Ensure S3 CORS includes OPTIONS, PUT, and your Lightning domain.

❌ 403 on PUT to S3

IAM role missing prefix permission

Wrong Content-Type mismatch

Security Notes

Use least privilege IAM

Avoid wildcard * in CORS

Keep presigned URL expiry low (5–10 min)

Consider SSE-S3 or SSE-KMS encryption
