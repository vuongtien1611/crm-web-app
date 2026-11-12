import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Tag,
  Row,
  Col,
  Alert,
  Space,
  Spin,
  Modal,
  Input,
  Form,
  Popconfirm,
} from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  GlobalOutlined,
  ShareAltOutlined,
  StarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  LoadingOutlined,
  RocketOutlined,
  CalendarOutlined,
  FileTextOutlined,
  ArrowRightOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { getLeadDetailApi, updateLeadStatusApi, markLeadFailedApi, restoreLeadConvertedApi, LeadDetail } from '../../api/leads';
import { LeadQualifyModal } from '../../components/leads/LeadQualifyModal';
import { LeadAssignModal } from '../../components/leads/LeadAssignModal';
import { LeadConvertDealModal } from '../../components/leads/LeadConvertDealModal';
import { DealEditQuickModal } from '../../components/deals/DealEditQuickModal';
import { ActivityTimeline } from '../../components/leads/ActivityTimeline';
import { formatDate, formatDateTime, getStatusLabel } from '../../constants/labels';
import { useAuthStore } from '../../store/authStore';
import {
  DetailPageHeader,
  DetailSummaryGrid,
  DetailSummaryItem,
  DetailSummaryCard,
  DetailInfoCard,
  DetailActivityBox,
  DetailHistorySection,
} from '../../components/common/detail';

export const LeadDetailPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const canAssignLead = Boolean(
    user?.roles?.some((r) => ['ADMIN', 'BOSS', 'SUPER_ADMIN', 'SALES_TEAM_LEADER'].includes(r)) ||
    user?.permissions?.includes('LEAD_ASSIGN')
  );
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  // Chỉ dùng loading toàn trang cho lần đầu mở trang
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Lưu trạng thái đang được bấm cập nhật để hiện loading trên nút
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Modals
  const [isQualifyOpen, setIsQualifyOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [isEditDealOpen, setIsEditDealOpen] = useState(false);
  const [isMarkFailedOpen, setIsMarkFailedOpen] = useState(false);
  const [restoringConverted, setRestoringConverted] = useState(false);

  const [failedReasonInput, setFailedReasonInput] = useState('');
  const [markFailedError, setMarkFailedError] = useState('');
  const [markFailedLoading, setMarkFailedLoading] = useState(false);

  // Tải thông tin chi tiết lead - isInitial = true chỉ chạy khi mới vào trang
  const fetchDetail = async (isInitial = false) => {
    if (!id) return;
    if (isInitial) setLoading(true);
    try {
      const data = await getLeadDetailApi(id);
      setLead(data);
    } catch (err: any) {
      if (isInitial) {
        setError(err.message || 'Không thể tải chi tiết khách hàng tiềm năng');
      } else {
        message.error(err.message || 'Không thể đồng bộ dữ liệu mới');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail(true);
  }, [id]);

  // Đổi trạng thái mượt mà bằng API, không reload browser
  const handleStatusChange = async (newStatus: LeadDetail['status']) => {
    if (!id || updatingStatus) return;
    setUpdatingStatus(newStatus);
    try {
      await updateLeadStatusApi(id, newStatus);
      // Cập nhật trạng thái ngay lập tức trên UI
      setLead((prev) => (prev ? { ...prev, status: newStatus } : prev));
      message.success(`Đã cập nhật trạng thái: ${getStatusLabel(newStatus)}`);
      // Tải lại ngầm để cập nhật timeline hoạt động mà không unmount trang
      await fetchDetail(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể cập nhật trạng thái');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Khôi phục trạng thái CONVERTED cho Lead đã có Deal (Rule 4)
  const handleRestoreConverted = async () => {
    if (!id || restoringConverted) return;
    setRestoringConverted(true);
    try {
      await restoreLeadConvertedApi(id);
      setLead((prev) => (prev ? { ...prev, status: 'CONVERTED' } : prev));
      message.success('Đã đưa Lead về trạng thái Đã chuyển đổi');
      await fetchDetail(false);
    } catch (err: any) {
      message.error(err.message || 'Không thể đưa Lead về trạng thái Đã chuyển đổi');
    } finally {
      setRestoringConverted(false);
    }
  };

  const handleMarkFailedSubmit = async () => {
    if (!id || !failedReasonInput.trim()) {
      setMarkFailedError('Vui lòng nhập lý do thất bại');
      return;
    }
    setMarkFailedLoading(true);
    setMarkFailedError('');

    try {
      await markLeadFailedApi(id, failedReasonInput);
      message.success('Đã đánh dấu thất bại');
      setIsMarkFailedOpen(false);
      setFailedReasonInput('');
      // Cập nhật lại dữ liệu ngầm
      await fetchDetail(false);
    } catch (err: any) {
      setMarkFailedError(err.message || 'Không thể đánh dấu thất bại');
    } finally {
      setMarkFailedLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="vmax-page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="vmax-page-wrapper" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Alert
          type="error"
          showIcon
          message="Lỗi tải dữ liệu"
          description={error || 'Không tìm thấy khách hàng tiềm năng'}
          style={{ maxWidth: 500, margin: '0 auto 24px auto' }}
        />
        <Button type="primary" onClick={() => navigate('/leads')}>
          Quay lại danh sách Lead
        </Button>
      </div>
    );
  }

  // Render Quality Badge
  const renderQualityTag = (quality: string) => {
    switch (quality) {
      case 'POTENTIAL':
        return <Tag color="success" style={{ fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>⭐ TIỀM NĂNG</Tag>;
      case 'NOT_POTENTIAL':
        return <Tag color="error" style={{ fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>🚫 KHÔNG TIỀM NĂNG</Tag>;
      default:
        return <Tag style={{ fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>CHƯA PHÂN LOẠI</Tag>;
    }
  };

  return (
    <div className="vmax-page-wrapper">
      {/* 1. Header tổng quan */}
      <DetailPageHeader
        title={lead.full_name}
        code={lead.id}
        backUrl="/leads"
        backLabel="Quay lại danh sách Lead"
        icon={<UserOutlined />}
        status={
          <Space size={6}>
            {renderQualityTag(lead.quality)}
            <Tag color="processing" style={{ fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
              {getStatusLabel(lead.status)}
            </Tag>
          </Space>
        }
        subtitle={
          <span>
            {lead.phone && <span>📞 {lead.phone} | </span>}
            {lead.email && <span>✉️ {lead.email} | </span>}
            <span>Phụ trách: <strong>{lead.assigned_sale_name || 'Chưa phân công'}</strong> | </span>
            <span>Ngày tạo: <strong>{formatDate(lead.created_at)}</strong></span>
          </span>
        }
        actions={
          <>
            <Button
              icon={<StarOutlined />}
              onClick={() => setIsQualifyOpen(true)}
            >
              Đánh giá chất lượng
            </Button>

            {canAssignLead && (
              <Button
                icon={<UserOutlined />}
                onClick={() => setIsAssignOpen(true)}
              >
                Phân công Sale
              </Button>
            )}

            {lead.deal && (
              <>
                <Button
                  icon={<RocketOutlined />}
                  onClick={() => navigate(`/deals/${lead.deal!.id}`)}
                >
                  Xem Deal (#{lead.deal.id})
                </Button>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setIsEditDealOpen(true)}
                >
                  Chỉnh sửa Deal
                </Button>
              </>
            )}

            {lead.deal && lead.status !== 'CONVERTED' && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={restoringConverted}
                onClick={handleRestoreConverted}
                style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
              >
                Đưa về Đã chuyển đổi
              </Button>
            )}

            {!lead.deal && lead.quality === 'POTENTIAL' && lead.status !== 'CONVERTED' && (
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={() => setIsConvertOpen(true)}
                style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
              >
                Chuyển đổi thành Deal
              </Button>
            )}

            {lead.status !== 'FAILED' && (
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => setIsMarkFailedOpen(true)}
              >
                Đánh dấu Thất bại
              </Button>
            )}
          </>
        }
      />

      {/* 2. Summary Cards */}
      <DetailSummaryGrid>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Trạng thái quy trình"
            value={getStatusLabel(lead.status)}
            valueColor="var(--vmax-green)"
            icon={<SyncOutlined />}
            subtitle="Tiến trình tư vấn"
          />
        </DetailSummaryItem>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Đánh giá chất lượng"
            value={lead.quality === 'POTENTIAL' ? 'Tiềm năng' : lead.quality === 'NOT_POTENTIAL' ? 'Không tiềm năng' : 'Chưa phân loại'}
            icon={<StarOutlined />}
            subtitle="Phân loại khách hàng"
          />
        </DetailSummaryItem>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Nguồn dẫn / Nền tảng"
            value={lead.platform_name || 'Trực tiếp'}
            icon={<GlobalOutlined />}
            subtitle={lead.channel_name ? `Kênh: ${lead.channel_name}` : 'Thủ công'}
          />
        </DetailSummaryItem>
        <DetailSummaryItem xs={24} sm={12} lg={6}>
          <DetailSummaryCard
            title="Nhân viên phụ trách"
            value={lead.assigned_sale_name || 'Chưa phân công'}
            icon={<UserOutlined />}
            subtitle="Sale chăm sóc"
          />
        </DetailSummaryItem>
      </DetailSummaryGrid>

      {/* Cảnh báo chất lượng / thất bại nếu có */}
      {lead.not_potential_reason && (
        <Alert
          type="warning"
          showIcon
          message="Lý do không tiềm năng:"
          description={lead.not_potential_reason}
          style={{ marginBottom: 16, borderRadius: 12 }}
        />
      )}
      {lead.failed_reason && (
        <Alert
          type="error"
          showIcon
          message="Lý do thất bại:"
          description={lead.failed_reason}
          style={{ marginBottom: 16, borderRadius: 12 }}
        />
      )}

      {/* Cảnh báo: Lead đã có Deal nhưng trạng thái hiện tại != CONVERTED (Rule 6) */}
      {lead.deal && lead.status !== 'CONVERTED' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #ffe58f', background: '#fffbe6' }}
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong style={{ fontSize: 15, color: '#d46b08' }}>
                  Lead này đã từng được chuyển thành Deal nhưng trạng thái hiện tại chưa phải Đã chuyển đổi.
                </strong>
                <div style={{ marginTop: 6, color: '#595959' }}>
                  <span>Deal liên kết: <strong>{lead.deal.deal_name}</strong> (Mã: #{lead.deal.id})</span>
                  <span style={{ marginLeft: 12 }}>Trạng thái Deal: <Tag color="processing">{lead.deal.status}</Tag></span>
                  {lead.deal.expected_value ? (
                    <span style={{ marginLeft: 12 }}>
                      Giá trị: <strong>{Number(lead.deal.expected_value).toLocaleString('vi-VN')} VND</strong>
                    </span>
                  ) : null}
                  {lead.deal.account_name && (
                    <span style={{ marginLeft: 12 }}>Doanh nghiệp: <strong>{lead.deal.account_name}</strong></span>
                  )}
                </div>
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={restoringConverted}
                  onClick={handleRestoreConverted}
                  style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
                >
                  Đưa về Đã chuyển đổi
                </Button>
                <Button
                  icon={<RocketOutlined />}
                  onClick={() => navigate(`/deals/${lead.deal!.id}`)}
                >
                  Xem Deal
                </Button>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setIsEditDealOpen(true)}
                >
                  Chỉnh sửa Deal
                </Button>
              </Space>
            </div>
          }
        />
      )}

      {/* Banner thông tin Deal đã tạo khi status === CONVERTED */}
      {lead.deal && lead.status === 'CONVERTED' && (
        <Alert
          type="success"
          showIcon
          icon={<RocketOutlined />}
          style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #b7eb8f', background: '#F6FBF7' }}
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong style={{ fontSize: 15, color: '#135200' }}>
                  Khách hàng này đã có Cơ hội bán hàng (Deal) liên kết:
                </strong>
                <div style={{ marginTop: 4 }}>
                  <span>Tên Deal: <strong>{lead.deal.deal_name}</strong> (Mã: #{lead.deal.id})</span>
                  <span style={{ marginLeft: 12 }}>Trạng thái Deal: <Tag color="processing">{lead.deal.status}</Tag></span>
                  {lead.deal.expected_value ? (
                    <span style={{ marginLeft: 12 }}>
                      Giá trị: <strong>{Number(lead.deal.expected_value).toLocaleString('vi-VN')} VND</strong>
                    </span>
                  ) : null}
                  {lead.deal.account_name && (
                    <span style={{ marginLeft: 12 }}>Doanh nghiệp: <strong>{lead.deal.account_name}</strong></span>
                  )}
                </div>
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate(`/deals/${lead.deal!.id}`)}
                  style={{ background: 'var(--vmax-green)', borderColor: 'var(--vmax-green)' }}
                >
                  Xem Deal #{lead.deal.id}
                </Button>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setIsEditDealOpen(true)}
                >
                  Chỉnh sửa Deal
                </Button>
              </Space>
            </div>
          }
        />
      )}

      {/* 3. Main 2-Column Responsive Layout */}
      <Row gutter={[20, 20]}>
        {/* Cột trái: Quy trình trạng thái & Thông tin khách hàng & Nguồn tiếp thị */}
        <Col xs={24} lg={13}>
          {/* Quy trình trạng thái */}
          <DetailInfoCard
            title="Cập nhật trạng thái tiến trình"
            icon={<SyncOutlined />}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {(['NEW', 'CALLED', 'CONSULTED', 'FOLLOWING', 'CONVERTED', 'FAILED'] as const).map((st) => {
                const isActive = lead.status === st;
                const isUpdatingThis = updatingStatus === st;

                const handleClick = () => {
                  if (isActive) return;
                  if (st === 'FAILED') {
                    setIsMarkFailedOpen(true);
                    return;
                  }
                  if (st === 'CONVERTED') {
                    if (lead.deal) {
                      handleRestoreConverted();
                    } else {
                      setIsConvertOpen(true);
                    }
                    return;
                  }
                  handleStatusChange(st);
                };

                return (
                  <Button
                    key={st}
                    disabled={isActive || !!updatingStatus || restoringConverted}
                    onClick={handleClick}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      height: 40,
                      borderRadius: 8,
                      fontWeight: 600,
                      background: isActive
                        ? st === 'CONVERTED'
                          ? '#EAF3ED'
                          : st === 'FAILED'
                          ? '#FEF2F2'
                          : 'var(--vmax-green)'
                        : undefined,
                      color: isActive
                        ? st === 'CONVERTED'
                          ? 'var(--vmax-green)'
                          : st === 'FAILED'
                          ? '#DC2626'
                          : '#ffffff'
                        : undefined,
                      borderColor: isActive
                        ? st === 'CONVERTED'
                          ? 'var(--vmax-green)'
                          : st === 'FAILED'
                          ? '#DC2626'
                          : 'var(--vmax-green)'
                        : undefined,
                    }}
                  >
                    <span>{getStatusLabel(st)}</span>
                    {isUpdatingThis ? (
                      <span style={{ fontSize: 12 }}><LoadingOutlined spin /> Đang đổi...</span>
                    ) : (
                      isActive && <span>✓ Hiện tại</span>
                    )}
                  </Button>
                );
              })}
            </div>
          </DetailInfoCard>

          {/* Thông tin khách hàng & liên hệ */}
          <DetailInfoCard
            title="Thông tin Khách hàng & Liên hệ"
            icon={<UserOutlined />}
            items={[
              {
                label: 'Họ và tên khách hàng',
                value: lead.full_name,
                icon: <UserOutlined />,
                span: 2,
              },
              {
                label: 'Số điện thoại',
                icon: <PhoneOutlined />,
                value: lead.phone ? (
                  <Space>
                    <span className="font-mono">{lead.phone}</span>
                    <a href={`tel:${lead.phone}`} style={{ color: 'var(--vmax-green)' }}>
                      <PhoneOutlined />
                    </a>
                  </Space>
                ) : (
                  'Chưa cập nhật'
                ),
              },
              {
                label: 'Email liên hệ',
                icon: <MailOutlined />,
                value: lead.email ? (
                  <a href={`mailto:${lead.email}`}>
                    {lead.email}
                  </a>
                ) : (
                  'Chưa cập nhật'
                ),
              },
              {
                label: 'Người phụ trách',
                icon: <UserOutlined />,
                value: lead.assigned_sale_name || 'Chưa phân công',
              },
              {
                label: 'Ngày tiếp nhận',
                icon: <CalendarOutlined />,
                value: formatDateTime(lead.created_at),
              },
            ]}
          />

          {/* Thông tin nguồn dẫn & tiếp thị */}
          <DetailInfoCard
            title="Thông tin Tiếp thị & Nguồn dẫn"
            icon={<GlobalOutlined />}
            items={[
              {
                label: 'Nền tảng (Platform)',
                value: lead.platform_name || 'Trực tiếp / Thủ công',
                icon: <GlobalOutlined />,
              },
              {
                label: 'Kênh tiếp thị (Channel)',
                value: lead.channel_name || 'Trực tiếp / Thủ công',
                icon: <ShareAltOutlined />,
              },
              {
                label: 'Nội dung tiếp thị',
                value: lead.content_title || 'N/A',
                icon: <FileTextOutlined />,
              },
              {
                label: 'Người tạo nội dung',
                value: lead.creator_employee_name || 'N/A',
                icon: <UserOutlined />,
              },
              ...(lead.landing_page
                ? [
                    {
                      label: 'Trang đích (Landing Page)',
                      value: (
                        <a href={lead.landing_page} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                          {lead.landing_page}
                        </a>
                      ),
                      span: 2,
                    },
                  ]
                : []),
              ...((lead.utm_source || lead.utm_medium || lead.utm_campaign)
                ? [
                    {
                      label: 'Tham số UTM',
                      value: (
                        <Space wrap size={4}>
                          {lead.utm_source && <Tag>source: {lead.utm_source}</Tag>}
                          {lead.utm_medium && <Tag>medium: {lead.utm_medium}</Tag>}
                          {lead.utm_campaign && <Tag>campaign: {lead.utm_campaign}</Tag>}
                        </Space>
                      ),
                      span: 2,
                    },
                  ]
                : []),
            ]}
          />
        </Col>

        {/* Cột phải: Dòng thời gian hoạt động & Lịch sử phân công */}
        <Col xs={24} lg={11}>
          <DetailActivityBox title="Nhật ký Hoạt động & Tương tác">
            <ActivityTimeline
              leadId={lead.id}
              activities={lead.activities}
              onRefresh={fetchDetail}
            />
          </DetailActivityBox>

          {/* Lịch sử phân công lại */}
          <DetailHistorySection title={`Lịch sử phân công lại (${lead.assignmentHistory.length})`}>
            {lead.assignmentHistory.length === 0 ? (
              <div style={{ color: 'var(--vmax-text-muted)', fontStyle: 'italic', fontSize: 13 }}>
                Chưa có lịch sử phân công lại.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lead.assignmentHistory.map((ah) => (
                  <div
                    key={ah.id}
                    style={{
                      background: '#F8FAF9',
                      border: '1px solid var(--vmax-border-light)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--vmax-text-muted)' }}>{ah.from_sale_name || 'Chưa phân công'}</span>
                      <ArrowRightOutlined style={{ margin: '0 8px', color: 'var(--vmax-green)' }} />
                      <strong style={{ color: 'var(--vmax-text)' }}>{ah.to_sale_name}</strong>
                      {ah.reason && (
                        <div style={{ color: 'var(--vmax-text-muted)', fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>
                          "{ah.reason}"
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--vmax-text-muted)' }}>
                      {formatDateTime(ah.assigned_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailHistorySection>
        </Col>
      </Row>

      {/* Modals */}
      <LeadQualifyModal
        isOpen={isQualifyOpen}
        leadId={lead.id}
        currentQuality={lead.quality}
        onClose={() => setIsQualifyOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />

      <LeadAssignModal
        isOpen={isAssignOpen}
        leadId={lead.id}
        currentSaleId={lead.assigned_sale_id}
        onClose={() => setIsAssignOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />

      <LeadConvertDealModal
        isOpen={isConvertOpen}
        leadId={lead.id}
        defaultContactName={lead.full_name}
        defaultPhone={lead.phone || ''}
        defaultEmail={lead.email || ''}
        onClose={() => setIsConvertOpen(false)}
        onSuccess={() => fetchDetail(false)}
      />

      {lead.deal && (
        <DealEditQuickModal
          isOpen={isEditDealOpen}
          dealId={lead.deal.id}
          initialDealName={lead.deal.deal_name}
          initialExpectedValue={lead.deal.expected_value ? Number(lead.deal.expected_value) : 0}
          onClose={() => setIsEditDealOpen(false)}
          onSuccess={() => fetchDetail(false)}
        />
      )}

      {/* Mark Failed Ant Design Modal */}
      <Modal
        title="Đánh dấu Lead THẤT BẠI"
        open={isMarkFailedOpen}
        onCancel={() => {
          setIsMarkFailedOpen(false);
          setMarkFailedError('');
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setIsMarkFailedOpen(false);
              setMarkFailedError('');
            }}
          >
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            danger
            loading={markFailedLoading}
            onClick={handleMarkFailedSubmit}
          >
            Đánh dấu THẤT BẠI
          </Button>,
        ]}
      >
        {markFailedError && (
          <Alert type="error" showIcon message={markFailedError} style={{ marginBottom: 14 }} />
        )}
        <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--vmax-text-muted)', textTransform: 'uppercase' }}>
          Lý do thất bại *
        </div>
        <Input.TextArea
          value={failedReasonInput}
          onChange={(e) => setFailedReasonInput(e.target.value)}
          rows={3}
          placeholder="Ví dụ: Khách chọn đối thủ cạnh tranh, Không liên lạc được sau nhiều lần gọi..."
        />
      </Modal>
    </div>
  );
};
