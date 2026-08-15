-- PHẦN 3 - CHẠY TEST CONSTRAINT
-- test_constraints.sql
-- Kịch bản Unit Test kiểm tra toàn bộ Data Integrity của Schema 1.0 (Bản Số Ít)

DO $$ 
DECLARE
  v_err_msg text;
  v_state text;
BEGIN
  RAISE NOTICE 'Bắt đầu chạy PostgreSQL Test Constraints...';

  -- 1. Lead status_id NULL → FAIL
  BEGIN
    INSERT INTO lead (full_name, source_id, status_id) VALUES ('Test', NULL, NULL);
    RAISE EXCEPTION 'Test 1 FAILED: NULL status_id did not fail';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'Test 1 PASS: Lead status_id NULL -> FAIL';
  END;

  -- 2. pipeline_stage: is_closed_won NULL → FAIL
  BEGIN
    INSERT INTO pipeline_stage (pipeline_id, code, name, order_index, is_closed_won) 
    VALUES ('00000000-0000-0000-0000-000000000001', 'T1', 'Test', 1, NULL);
    RAISE EXCEPTION 'Test 2 FAILED: NULL is_closed_won did not fail';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'Test 2 PASS: pipeline_stage is_closed_won NULL -> FAIL';
  END;

  -- 3. Stage: is_closed_won = TRUE, is_closed_lost = TRUE → FAIL
  BEGIN
    INSERT INTO pipeline (id, name) VALUES ('00000000-0000-0000-0000-000000000002', 'Pipeline 2');
    INSERT INTO pipeline_stage (pipeline_id, code, name, order_index, is_closed_won, is_closed_lost) 
    VALUES ('00000000-0000-0000-0000-000000000002', 'T2', 'Test', 1, TRUE, TRUE);
    RAISE EXCEPTION 'Test 3 FAILED: Both won and lost TRUE did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 3 PASS: is_closed_won = TRUE and is_closed_lost = TRUE -> FAIL';
  END;

  -- 4. Deal amount âm → FAIL
  BEGIN
    INSERT INTO account (id, name) VALUES ('00000000-0000-0000-0000-000000000003', 'Account 3');
    INSERT INTO pipeline_stage (id, pipeline_id, code, name, order_index) 
    VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'T3', 'Test3', 2);
    
    INSERT INTO deal (name, account_id, pipeline_id, stage_id, amount)
    VALUES ('D1', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', -10);
    RAISE EXCEPTION 'Test 4 FAILED: Deal amount âm did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 4 PASS: Deal amount âm -> FAIL';
  END;

  -- 5. Lead expected_value âm → FAIL
  BEGIN
    INSERT INTO lead_source (id, code, name) VALUES ('00000000-0000-0000-0000-000000000010', 'SRC', 'Src');
    INSERT INTO lead_status (id, code, name) VALUES ('00000000-0000-0000-0000-000000000011', 'STAT', 'Stat');
    INSERT INTO lead (full_name, source_id, status_id, expected_value) VALUES ('L1', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011', -50);
    RAISE EXCEPTION 'Test 5 FAILED: expected_value < 0 did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 5 PASS: Lead expected_value âm -> FAIL';
  END;

  -- 6. Discount percent NULL → FAIL
  BEGIN
    INSERT INTO deal (id, name, account_id, pipeline_id, stage_id, amount)
    VALUES ('00000000-0000-0000-0000-000000000005', 'D2', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 100);
    
    INSERT INTO discount_request (deal_id, requested_discount_percent, reason)
    VALUES ('00000000-0000-0000-0000-000000000005', NULL, 'Reason');
    RAISE EXCEPTION 'Test 6 FAILED: NULL discount_percent did not fail';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'Test 6 PASS: Discount percent NULL -> FAIL';
  END;

  -- 7. Discount percent > 100 → FAIL
  BEGIN
    INSERT INTO discount_request (deal_id, requested_discount_percent, reason)
    VALUES ('00000000-0000-0000-0000-000000000005', 105, 'Reason');
    RAISE EXCEPTION 'Test 7 FAILED: discount_percent > 100 did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 7 PASS: Discount percent > 100 -> FAIL';
  END;

  -- 8. Duplicate: lead_assignment_rule_member(rule_id, order_index) → FAIL
  BEGIN
    INSERT INTO lead_assignment_rule (id, name, rule_type) VALUES ('00000000-0000-0000-0000-000000000006', 'R1', 'round_robin');
    INSERT INTO "user" (id, email, password_hash, full_name) VALUES ('00000000-0000-0000-0000-000000000007', 'u1@u.com', 'x', 'u1');
    INSERT INTO "user" (id, email, password_hash, full_name) VALUES ('00000000-0000-0000-0000-000000000008', 'u2@u.com', 'x', 'u2');
    
    INSERT INTO lead_assignment_rule_member (rule_id, user_id, order_index) VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000007', 1);
    INSERT INTO lead_assignment_rule_member (rule_id, user_id, order_index) VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000008', 1);
    RAISE EXCEPTION 'Test 8 FAILED: Duplicate order_index did not fail';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Test 8 PASS: Duplicate rule_id, order_index -> FAIL';
  END;

  -- 9. pipeline_stage.order_index âm → FAIL
  BEGIN
    INSERT INTO pipeline_stage (pipeline_id, code, name, order_index) 
    VALUES ('00000000-0000-0000-0000-000000000002', 'T4', 'Test4', -1);
    RAISE EXCEPTION 'Test 9 FAILED: Negative order_index did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 9 PASS: pipeline_stage.order_index âm -> FAIL';
  END;

  -- 10. discount_approval_step.step_order âm → FAIL
  BEGIN
    INSERT INTO discount_request (id, deal_id, requested_discount_percent, reason)
    VALUES ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000005', 10, 'Reason');
    INSERT INTO discount_approval_step (request_id, step_order) VALUES ('00000000-0000-0000-0000-000000000012', -1);
    RAISE EXCEPTION 'Test 10 FAILED: Negative step_order did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 10 PASS: discount_approval_step.step_order âm -> FAIL';
  END;

  -- 11. campaign_step.step_order âm → FAIL
  BEGIN
    INSERT INTO campaign (id, name) VALUES ('00000000-0000-0000-0000-000000000013', 'Camp 1');
    INSERT INTO campaign_step (campaign_id, step_order, action_type) VALUES ('00000000-0000-0000-0000-000000000013', -1, 'task');
    RAISE EXCEPTION 'Test 11 FAILED: Negative step_order did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 11 PASS: campaign_step.step_order âm -> FAIL';
  END;

  -- 12. Campaign action_type=email nhưng template_id=NULL → FAIL
  BEGIN
    INSERT INTO campaign_step (campaign_id, step_order, action_type, template_id) 
    VALUES ('00000000-0000-0000-0000-000000000013', 1, 'email', NULL);
    RAISE EXCEPTION 'Test 12 FAILED: email without template did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 12 PASS: Campaign action_type=email but template_id=NULL -> FAIL';
  END;

  -- 13. Activity không có entity → FAIL
  BEGIN
    INSERT INTO activity (type, subject, description) VALUES ('call', 'Test', 'Test');
    RAISE EXCEPTION 'Test 13 FAILED: Activity without entity did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 13 PASS: Activity không có entity -> FAIL';
  END;

  -- 14. Activity có 2 entity cùng lúc → FAIL
  BEGIN
    INSERT INTO lead (id, full_name, source_id, status_id) VALUES ('00000000-0000-0000-0000-000000000020', 'L2', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000011');
    INSERT INTO activity (type, subject, lead_id, account_id) VALUES ('call', 'Test', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'Test 14 FAILED: Activity with 2 entities did not fail';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Test 14 PASS: Activity có 2 entity cùng lúc -> FAIL';
  END;

  -- 15. Deal: Pipeline A + Stage B → FAIL
  BEGIN
    INSERT INTO deal (name, account_id, pipeline_id, stage_id)
    VALUES ('D3', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Test 15 FAILED: Deal with Pipeline A + Stage B did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 15 PASS: Deal Pipeline A + Stage B -> FAIL';
  END;

  -- 16. Deal: Account A + Contact của Account B → FAIL
  BEGIN
    INSERT INTO account (id, name) VALUES ('00000000-0000-0000-0000-000000000021', 'Account B');
    INSERT INTO contact (id, account_id, first_name, last_name) VALUES ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000021', 'F', 'L');
    INSERT INTO deal (name, account_id, contact_id, pipeline_id, stage_id)
    VALUES ('D4', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'Test 16 FAILED: Deal with Account A + Contact B did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 16 PASS: Deal Account A + Contact B -> FAIL';
  END;

  -- 17. Ticket: Account A + Contact của Account B → FAIL
  BEGIN
    INSERT INTO ticket (subject, account_id, contact_id)
    VALUES ('T1', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000022');
    RAISE EXCEPTION 'Test 17 FAILED: Ticket with Account A + Contact B did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 17 PASS: Ticket Account A + Contact B -> FAIL';
  END;

  -- 18. Campaign Enrollment: Campaign A + Step Campaign B → FAIL
  BEGIN
    INSERT INTO campaign (id, name) VALUES ('00000000-0000-0000-0000-000000000030', 'Camp B');
    INSERT INTO campaign_step (id, campaign_id, step_order, action_type) VALUES ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000030', 1, 'task');
    INSERT INTO campaign_enrollment (campaign_id, lead_id, current_step_id)
    VALUES ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000031');
    RAISE EXCEPTION 'Test 18 FAILED: Enrollment with Campaign A + Step B did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 18 PASS: Campaign Enrollment Campaign A + Step B -> FAIL';
  END;

  -- 19. Webhook duplicate: provider + external_id giống nhau → FAIL
  BEGIN
    INSERT INTO webhook_inbound (provider, external_id, payload) VALUES ('fb', '123', '{}');
    INSERT INTO webhook_inbound (provider, external_id, payload) VALUES ('fb', '123', '{}');
    RAISE EXCEPTION 'Test 19 FAILED: Webhook duplicate provider+external_id did not fail';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Test 19 PASS: Webhook duplicate provider+external_id -> FAIL';
  END;

  -- 20. Webhook external_id NULL nhiều lần → PASS
  BEGIN
    INSERT INTO webhook_inbound (provider, external_id, payload) VALUES ('fb', NULL, '{}');
    INSERT INTO webhook_inbound (provider, external_id, payload) VALUES ('fb', NULL, '{}');
    RAISE NOTICE 'Test 20 PASS: Webhook external_id NULL nhiều lần -> PASS';
  END;

  -- 21. Xóa Deal có deal_stage_history → FAIL do RESTRICT
  BEGIN
    INSERT INTO deal_stage_history (deal_id, old_stage_id, new_stage_id) VALUES ('00000000-0000-0000-0000-000000000005', NULL, '00000000-0000-0000-0000-000000000004');
    DELETE FROM deal WHERE id = '00000000-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'Test 21 FAILED: Deleting Deal with stage history did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 21 PASS: Xóa Deal có deal_stage_history -> FAIL (RESTRICT)';
  END;

  -- 22. Xóa Lead có assignment history → FAIL
  BEGIN
    INSERT INTO lead_assignment_history (lead_id) VALUES ('00000000-0000-0000-0000-000000000020');
    DELETE FROM lead WHERE id = '00000000-0000-0000-0000-000000000020';
    RAISE EXCEPTION 'Test 22 FAILED: Deleting Lead with assignment history did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 22 PASS: Xóa Lead có assignment history -> FAIL (RESTRICT)';
  END;

  -- 23. Xóa Deal có discount request → FAIL
  BEGIN
    DELETE FROM deal WHERE id = '00000000-0000-0000-0000-000000000005';
    RAISE EXCEPTION 'Test 23 FAILED: Deleting Deal with discount request did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 23 PASS: Xóa Deal có discount request -> FAIL (RESTRICT)';
  END;

  -- 24. Xóa Ticket có reply → FAIL
  BEGIN
    INSERT INTO ticket (id, subject, account_id) VALUES ('00000000-0000-0000-0000-000000000040', 'Sub', '00000000-0000-0000-0000-000000000003');
    INSERT INTO ticket_reply (ticket_id, message) VALUES ('00000000-0000-0000-0000-000000000040', 'Rep');
    DELETE FROM ticket WHERE id = '00000000-0000-0000-0000-000000000040';
    RAISE EXCEPTION 'Test 24 FAILED: Deleting Ticket with reply did not fail';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Test 24 PASS: Xóa Ticket có reply -> FAIL (RESTRICT)';
  END;

  -- 25. updated_at trigger
  BEGIN
    PERFORM pg_sleep(0.1);
    UPDATE lead SET full_name = 'L2 Updated' WHERE id = '00000000-0000-0000-0000-000000000020';
    IF (SELECT updated_at > created_at FROM lead WHERE id = '00000000-0000-0000-0000-000000000020') THEN
      RAISE NOTICE 'Test 25 PASS: updated_at trigger hoạt động đúng (lớn hơn created_at)';
    ELSE
      RAISE EXCEPTION 'Test 25 FAILED: updated_at not updated';
    END IF;
  END;

  RAISE NOTICE 'Hoàn tất toàn bộ 25 bài test, mọi constraints đều đã hoạt động như thiết kế.';
END $$;
