-- Migration: Add PROJECT_DELIVERY commission policies for SEO position
-- 1 PRIMARY = 3% (0.0300)
-- 2 PRIMARY = 2% each (0.0200)
-- SUPPORT = 0% (enforced by code: eligibility service only evaluates PRIMARY assignees)

DO $$
DECLARE
    v_pos_seo BIGINT;
    v_srv_seo BIGINT;
BEGIN
    SELECT id INTO v_pos_seo FROM positions WHERE code = 'SEO';
    SELECT id INTO v_srv_seo FROM services WHERE code = 'SEO';

    IF v_pos_seo IS NOT NULL THEN
        -- 1) Specific SEO service (service_id = v_srv_seo): 1 Primary SEO -> 3%
        IF v_srv_seo IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM commission_policies 
                WHERE policy_type = 'PROJECT_DELIVERY' 
                  AND service_id = v_srv_seo 
                  AND position_id = v_pos_seo 
                  AND assignee_count = 1
            ) THEN
                UPDATE commission_policies 
                SET rate = 0.0300, 
                    policy_name = 'Chính Sách Hoa Hồng Kỹ Thuật Project SEO (1 SEO Chính)',
                    effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
                WHERE policy_type = 'PROJECT_DELIVERY' 
                  AND service_id = v_srv_seo 
                  AND position_id = v_pos_seo 
                  AND assignee_count = 1;
            ELSE
                INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
                VALUES ('Chính Sách Hoa Hồng Kỹ Thuật Project SEO (1 SEO Chính)', 'PROJECT_DELIVERY', v_srv_seo, v_pos_seo, 1, 0.0300, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
            END IF;

            -- 2) Specific SEO service (service_id = v_srv_seo): 2 Primary SEOs -> 2% EACH
            IF EXISTS (
                SELECT 1 FROM commission_policies 
                WHERE policy_type = 'PROJECT_DELIVERY' 
                  AND service_id = v_srv_seo 
                  AND position_id = v_pos_seo 
                  AND assignee_count = 2
            ) THEN
                UPDATE commission_policies 
                SET rate = 0.0200, 
                    policy_name = 'Chính Sách Hoa Hồng Kỹ Thuật Project SEO (2 SEO Chính)',
                    effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
                WHERE policy_type = 'PROJECT_DELIVERY' 
                  AND service_id = v_srv_seo 
                  AND position_id = v_pos_seo 
                  AND assignee_count = 2;
            ELSE
                INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
                VALUES ('Chính Sách Hoa Hồng Kỹ Thuật Project SEO (2 SEO Chính)', 'PROJECT_DELIVERY', v_srv_seo, v_pos_seo, 2, 0.0200, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
            END IF;
        END IF;

        -- 3) Generic Delivery Policy for SEO position across ANY service (service_id IS NULL): 1 Primary SEO -> 3%
        IF EXISTS (
            SELECT 1 FROM commission_policies 
            WHERE policy_type = 'PROJECT_DELIVERY' 
              AND service_id IS NULL 
              AND position_id = v_pos_seo 
              AND assignee_count = 1
        ) THEN
            UPDATE commission_policies 
            SET rate = 0.0300, 
                policy_name = 'Chính Sách Hoa Hồng Kỹ Thuật Giao Dự Án (1 SEO Chính)',
                effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
            WHERE policy_type = 'PROJECT_DELIVERY' 
              AND service_id IS NULL 
              AND position_id = v_pos_seo 
              AND assignee_count = 1;
        ELSE
            INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
            VALUES ('Chính Sách Hoa Hồng Kỹ Thuật Giao Dự Án (1 SEO Chính)', 'PROJECT_DELIVERY', NULL, v_pos_seo, 1, 0.0300, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
        END IF;

        -- 4) Generic Delivery Policy for SEO position across ANY service (service_id IS NULL): 2 Primary SEOs -> 2% EACH
        IF EXISTS (
            SELECT 1 FROM commission_policies 
            WHERE policy_type = 'PROJECT_DELIVERY' 
              AND service_id IS NULL 
              AND position_id = v_pos_seo 
              AND assignee_count = 2
        ) THEN
            UPDATE commission_policies 
            SET rate = 0.0200, 
                policy_name = 'Chính Sách Hoa Hồng Kỹ Thuật Giao Dự Án (2 SEO Chính)',
                effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
            WHERE policy_type = 'PROJECT_DELIVERY' 
              AND service_id IS NULL 
              AND position_id = v_pos_seo 
              AND assignee_count = 2;
        ELSE
            INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
            VALUES ('Chính Sách Hoa Hồng Kỹ Thuật Giao Dự Án (2 SEO Chính)', 'PROJECT_DELIVERY', NULL, v_pos_seo, 2, 0.0200, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
        END IF;
    END IF;
END $$;
