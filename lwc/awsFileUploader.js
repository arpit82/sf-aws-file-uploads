import { LightningElement, api, track } from 'lwc';
import getPresignedUrl from '@salesforce/apex/S3FileController.getPresignedUrl';
import saveFileMetadata from '@salesforce/apex/S3FileController.saveFileMetadata';

export default class AwsFileUploader extends LightningElement {
    @api recordId;
    @track file = null;
    @track fileName = '';
    @track fileSizeReadable = '';
    @track uploading = false;
    @track progress = 0;
    @track message = '';
    @track messageClass = '';

    // Configure your bucket name here
    bucketName = 'sfdc-file-uploads';
    presignExpiresIn = 600;

    get uploadDisabled() {
        return !this.file || this.uploading;
    }

    get progressStyle() {
        return `width: ${this.progress}%; height: 100%;`;
    }

    handleFileChange(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            this.file = files[0];
            this.fileName = this.file.name;
            this.fileSizeReadable = this.formatSize(this.file.size);
            this.message = '';
            this.progress = 0;
        }
    }

    handleClear() {
        this.resetComponent();
    }

    formatSize(bytes) {
        const thresh = 1024;
        if (Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }
        const units = ['KB', 'MB', 'GB'];
        let i = -1;
        do {
            bytes /= thresh;
            i++;
        } while (Math.abs(bytes) >= thresh && i < units.length - 1);
        return bytes.toFixed(1) + ' ' + units[i];
    }

    async handleUpload() {
        if (!this.file) {
            this.showMessage('No file selected.', 'error');
            return;
        }

        this.uploading = true;
        this.progress = 0;
        this.message = '';

        try {
            const key = `salesforce/uploads/${this.recordId || 'anonymous'}/${Date.now()}_${this.fileName}`;

            const presign = await getPresignedUrl({
                bucket: this.bucketName,
                key,
                contentType: this.file.type || 'application/octet-stream',
                expiresIn: this.presignExpiresIn
            });

            if (!presign || !presign.presignedUrl) {
                throw new Error('Failed to retrieve presigned URL');
            }

            const presignedUrl = presign.presignedUrl;

            await this.uploadToS3(presignedUrl, this.file, this.file.type || 'application/octet-stream');

            const cleanUrl = presignedUrl.split('?')[0];

            if (this.recordId) {
                try {
                    await saveFileMetadata({
                        recordId: this.recordId,
                        fileName: this.fileName,
                        s3Key: key,
                        s3Url: cleanUrl
                    });
                } catch (err) {
                    // non-fatal
                    // eslint-disable-next-line no-console
                    console.warn('Metadata save failed', err);
                }
            }

            this.showMessage('Upload successful!', 'success');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            const errMsg = err && err.message ? err.message : String(err);
            this.showMessage(`Upload failed: ${errMsg}`, 'error');
        } finally {
            this.uploading = false;
            this.resetInput();
        }
    }

    uploadToS3(url, file, contentType) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url, true);

            if (contentType) {
                try {
                    xhr.setRequestHeader('Content-Type', contentType);
                } catch (e) {
                    // some browsers ignore cross-origin header setting; continue
                    // eslint-disable-next-line no-console
                    console.warn('Could not set Content-Type header', e);
                }
            }

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    this.progress = Math.round((event.loaded / event.total) * 100);
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200 || xhr.status === 204) {
                    resolve();
                } else {
                    const responseText = xhr.responseText || '';
                    reject(new Error(`S3 upload failed with status ${xhr.status}. ${responseText}`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(file);
        });
    }

    showMessage(text, type) {
        this.message = text;
        this.messageClass = type === 'success' ? 'slds-text-color_success' : 'slds-text-color_error';
    }

    resetInput() {
        const input = this.template.querySelector('lightning-input[data-id="fileInput"]');
        if (input) input.value = null;
        this.file = null;
        this.fileName = '';
        this.fileSizeReadable = '';
    }

    resetComponent() {
        this.resetInput();
        this.progress = 0;
        this.message = '';
        this.uploading = false;
    }
}