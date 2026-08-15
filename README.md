# CRM Web App

## Giới thiệu
Đây là đồ án xây dựng hệ thống Customer Relationship Management (CRM) hỗ trợ:
- Quản lý Lead
- Quản lý khách hàng
- Sales Pipeline
- Deal
- Follow-up
- Customer Support
- Email Marketing
- Automation
- RBAC
- Audit Log
- Dashboard / Forecast

## Công nghệ
- PostgreSQL
- Backend: sẽ phát triển ở giai đoạn tiếp theo
- Frontend: sẽ phát triển ở giai đoạn tiếp theo

## Cấu trúc Repository

```text
du-an-cuoi-khoa-f8/
│
├── database/
│   ├── crm_schema.sql
│   ├── crm_seed.sql
│   ├── test_constraints.sql
│   └── crm_demo_queries.sql
│
├── docs/
│   ├── crm_database_design.md
│   ├── crm_tables_reference.md
│   └── demo_database.md
│
├── README.md
└── .gitignore
```

## Database

- `database/crm_schema.sql`: Cấu trúc PostgreSQL chính.
- `database/crm_seed.sql`: Dữ liệu mẫu.
- `database/test_constraints.sql`: Kiểm thử Constraint và Data Integrity.
- `database/crm_demo_queries.sql`: Query demo cho Dashboard và báo cáo.

## Documentation

- `docs/crm_database_design.md`: Phân tích nghiệp vụ, ERD, chuẩn hóa và kiến trúc Database.
- `docs/crm_tables_reference.md`: Data Dictionary / danh sách bảng.
- `docs/demo_database.md`: Hướng dẫn chạy Database và chuẩn bị bảo vệ.

## Cách chạy Database

```bash
createdb crm_test

psql -d crm_test -f database/crm_schema.sql
psql -d crm_test -f database/crm_seed.sql
psql -d crm_test -f database/test_constraints.sql
psql -d crm_test -f database/crm_demo_queries.sql
```
