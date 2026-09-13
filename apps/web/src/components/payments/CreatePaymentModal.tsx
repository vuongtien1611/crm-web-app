import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Upload,
  Button,
  Space,
  Typography,
  Image,
  App,
} from 'antd';
import {
  UploadOutlined,
  DeleteOutlined,
  PictureOutlined,
  LinkOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { createPaymentApi } from '../../api/payments';
import { uploadFileApi } from '../../api/storage';

const { Text } = Typography;

interface CreatePaymentModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE_MB = 10;

const PAYMENT_METHOD_OPTIONS = [
  { label: 'Chuyển khoản ngân hàng (Bank Transfer)', value: 'BANK_TRANSFER' },
  { label: 'Tiền mặt', value: 'CASH' },
  { label: 'Thẻ tín dụng', value: 'CREDIT_CARD' },
  { label: 'Ví điện tử', value: 'E_WALLET' },
];

export const CreatePaymentModal: React.FC<CreatePaymentModalProps> = ({
  visible,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [proofType, setProofType] = useState<'upload' | 'url'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resetModalState = () => {
    form.resetFields();
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setProofType('upload');
  };

  const handleCancel = () => {
    resetModalState();
    onCancel();
  };

  const handleBeforeUpload = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);

    if (!isImage) {
      message.error('Chỉ chấp nhận tệp ảnh định dạng JPG, JPEG, PNG hoặc WEBP');
      return Upload.LIST_IGNORE;
    }

    const isLt10M = file.size / 1024 / 1024 <= MAX_FILE_SIZE_MB;
    if (!isLt10M) {
      message.error(`Dung lượng ảnh tối đa là ${MAX_FILE_SIZE_MB}MB`);
      return Upload.LIST_IGNORE;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    return false; // Prevent auto upload by Ant Design, handled on form submit
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      let finalEvidenceUrl: string | undefined = undefined;

      if (proofType === 'upload') {
        if (selectedFile) {
          // Upload via existing storage service (NOT base64 in DB)
          const tempEntityId = `temp-${Date.now()}`;
          const uploadRes = await uploadFileApi('payments', tempEntityId, selectedFile);
          finalEvidenceUrl = uploadRes.objectKey;
        }
      } else {
        finalEvidenceUrl = values.evidenceUrl?.trim() || undefined;
      }

      let rawAmount = values.grossCashAmount;
      if (typeof rawAmount === 'string') {
        rawAmount = (rawAmount as string).replace(/\./g, '').replace(/,/g, '').trim();
      }
      const numericAmount = Number(rawAmount);
      if (!Number.isFinite(numericAmount) || numericAmount < 0.01) {
        message.error('Số tiền thực thu không hợp lệ (phải là số lớn hơn 0)');
        setLoading(false);
        return;
      }

      const payload = {
        grossCashAmount: numericAmount,
        paymentMethod: values.paymentMethod,
        evidenceUrl: finalEvidenceUrl,
        paymentCode: values.paymentCode?.trim() || undefined,
      };

      await createPaymentApi(payload);

      message.success('Tạo giao dịch thanh toán thành công (Chờ xác nhận)');
      resetModalState();
      onSuccess();
    } catch (err: any) {
      message.error(err.message || err?.response?.data?.message || 'Không thể tạo thanh toán');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Ghi nhận giao dịch thanh toán mới</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="Tạo thanh toán"
      cancelText="Hủy"
      width={560}
      destroyOnHidden
    >
      <Form className="vmax-form" form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="paymentCode"
          label={<Text strong>Mã giao dịch / Mã tham chiếu</Text>}
          extra="Để trống để hệ thống tự động sinh mã"
        >
          <Input placeholder="Ví dụ: PAY-20260912-001" />
        </Form.Item>

        <Form.Item
          name="grossCashAmount"
          label={<Text strong>Số tiền thực thu (VND)</Text>}
          rules={[{ required: true, message: 'Vui lòng nhập số tiền thực thu' }]}
        >
          <InputNumber<number>
            style={{ width: '100%' }}
            min={1000}
            step={100000}
            placeholder="5.000.000"
            formatter={(value) => (value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
            parser={(value) => (value ? Number(value.replace(/\$\s?|(\.*)|(,*)/g, '')) : (0 as any))}
          />
        </Form.Item>

        <Form.Item
          name="paymentMethod"
          label={<Text strong>Phương thức thanh toán</Text>}
          initialValue="BANK_TRANSFER"
          rules={[{ required: true, message: 'Vui lòng chọn phương thức thanh toán' }]}
        >
          <Select options={PAYMENT_METHOD_OPTIONS} />
        </Form.Item>

        <Form.Item
          label={<Text strong>Bằng chứng thanh toán (Ủy nhiệm chi / Bill chuyển khoản)</Text>}
          style={{ marginBottom: 12 }}
        >
          <Radio.Group
            value={proofType}
            onChange={(e) => setProofType(e.target.value)}
            style={{ marginBottom: 14 }}
          >
            <Radio.Button value="upload">
              <PictureOutlined style={{ marginRight: 6 }} />
              Chọn ảnh từ máy tính
            </Radio.Button>
            <Radio.Button value="url">
              <LinkOutlined style={{ marginRight: 6 }} />
              Nhập liên kết (URL)
            </Radio.Button>
          </Radio.Group>

          {proofType === 'upload' ? (
            <div style={{ background: '#FAFCFA', padding: 14, borderRadius: 10, border: '1px solid #DDE7E1' }}>
              {!selectedFile ? (
                <Upload.Dragger
                  name="file"
                  multiple={false}
                  showUploadList={false}
                  beforeUpload={handleBeforeUpload}
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  style={{ padding: '16px 0', background: '#FFFFFF', borderRadius: 8 }}
                >
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                    <UploadOutlined style={{ fontSize: 28, color: 'var(--vmax-green, #0C6B37)' }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                    Nhấp hoặc kéo thả ảnh bill chuyển khoản vào đây
                  </p>
                  <p className="ant-upload-hint" style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    Hỗ trợ JPG, JPEG, PNG, WEBP (tối đa 10MB)
                  </p>
                </Upload.Dragger>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                    }}
                  >
                    <Space>
                      <PictureOutlined style={{ color: 'var(--vmax-green, #0C6B37)' }} />
                      <Text strong style={{ fontSize: 13 }}>
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </Text>
                    </Space>
                    <Space>
                      <Upload
                        multiple={false}
                        showUploadList={false}
                        beforeUpload={handleBeforeUpload}
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      >
                        <Button size="small">Chọn lại</Button>
                      </Upload>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleRemoveFile}
                      >
                        Xóa ảnh
                      </Button>
                    </Space>
                  </div>

                  {previewUrl && (
                    <div
                      style={{
                        textAlign: 'center',
                        background: '#F0F4F2',
                        borderRadius: 8,
                        padding: 8,
                        maxHeight: 220,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Image
                        src={previewUrl}
                        alt="Preview bằng chứng thanh toán"
                        style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }}
                        preview={{
                          mask: (
                            <Space>
                              <EyeOutlined /> Xem ảnh gốc
                            </Space>
                          ),
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Form.Item
              name="evidenceUrl"
              noStyle
              rules={[
                {
                  type: 'url',
                  message: 'Vui lòng nhập địa chỉ URL hợp lệ (bắt đầu bằng http:// hoặc https://)',
                },
              ]}
            >
              <Input placeholder="https://docs.crm.loc/evidence/receipt-001.pdf" />
            </Form.Item>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};
