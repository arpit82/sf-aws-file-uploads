# lambda_function.py
import os
import json
import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Optional allowlist — set via Lambda environment or hardcode allowed buckets/prefixes
ALLOWED_BUCKETS = os.environ.get('ALLOWED_BUCKETS', '')  # comma separated, e.g. "my-bucket"
ALLOWED_KEY_PREFIXES = os.environ.get('ALLOWED_KEY_PREFIXES', '')  # comma separated prefixes e.g. "uploads/,user-uploads/"

s3_client = boto3.client('s3')


def is_allowed_bucket(bucket_name):
    if not ALLOWED_BUCKETS:
        return True
    allowed = [b.strip() for b in ALLOWED_BUCKETS.split(',') if b.strip()]
    return bucket_name in allowed


def is_allowed_key(bucket_key):
    if not ALLOWED_KEY_PREFIXES:
        return True
    prefixes = [p.strip() for p in ALLOWED_KEY_PREFIXES.split(',') if p.strip()]
    return any(bucket_key.startswith(p) for p in prefixes)


def generate_presigned_put_url(bucket_name, object_key, content_type=None, expires_in=900):
    """
    Generate a presigned URL to upload (PUT) an object to S3.
    """
    params = {'Bucket': bucket_name, 'Key': object_key}
    # If you want to require Content-Type on upload, include it to lock the signed URL
    if content_type:
        params['ContentType'] = content_type

    try:
        url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params=params,
            ExpiresIn=expires_in,
            HttpMethod='PUT'
        )
    except ClientError as e:
        logger.exception("Failed generating presigned URL")
        raise

    return url


def lambda_handler(event, context):
    """
    Expected event: API Gateway proxy with JSON body:
    {
      "bucket": "my-bucket",
      "key": "uploads/userid/filename.ext",
      "content_type": "text/plain",  # optional
      "expires_in": 300              # optional seconds
    }
    """
    try:
        logger.info("Event: %s", event)
        # If API Gateway proxy integration, body could be event['body'] as string
        body = event.get('body')
        if body and isinstance(body, str):
            payload = json.loads(body)
        elif body and isinstance(body, dict):
            payload = body
        else:
            # maybe event directly passed JSON (when testing)
            payload = event

        bucket = payload.get('bucket')
        key = payload.get('key')
        content_type = payload.get('content_type')
        expires_in = int(payload.get('expires_in', 900))

        if not bucket or not key:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "bucket and key are required"})
            }

        if not is_allowed_bucket(bucket):
            return {"statusCode": 403, "body": json.dumps({"error": "bucket not allowed"})}

        if not is_allowed_key(key):
            return {"statusCode": 403, "body": json.dumps({"error": "key/prefix not allowed"})}

        presigned_url = generate_presigned_put_url(bucket, key, content_type=content_type, expires_in=expires_in)

        response_body = {
            "presigned_url": presigned_url,
            "method": "PUT",
            "expires_in": expires_in,
            "s3_object_key": key,
            "bucket": bucket
        }

        return {"statusCode": 200, "body": json.dumps(response_body)}

    except Exception as e:
        logger.exception("Unhandled error")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
