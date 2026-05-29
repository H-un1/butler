import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// AI 보조 (Phase 3 M5) 통합 테스트 — 전부 mock(외부 모델/네트워크 호출 0).
// aiBackendBaseUrl 미주입 buildApp이므로 로컬 mock으로만 동작해야 한다.

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'aiassist-route-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: true,
};

// 13자리 주민번호 패턴 (마스킹 누락 탐지용).
const RRN_PATTERN = /\d{6}-?\d{7}/;

async function login(app: Express, role: Role, name: string): Promise<string> {
  const r = await request(app)
    .post('/auth/exchange')
    .send({ provider: 'dev-mock', code: `dev:${role}:${name}`, role });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

describe('AI 보조 routes (통합, 로컬 mock)', () => {
  let app: Express;
  beforeEach(() => {
    // aiBackendBaseUrl 미주입 → 로컬 mock 폴백 (ai-python 없이 동작).
    app = buildApp(TEST_ENV);
  });

  describe('챗봇 /chatbot', () => {
    it('임대인 질문 → 200 answer/topic/mock + history 반영', async () => {
      const token = await login(app, ROLES.LANDLORD, 'hong');
      const ask = await request(app)
        .post('/chatbot/ask')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: '보증금 반환은 어떻게 받나요?' });
      expect(ask.status).toBe(200);
      expect(ask.body.answer).toBeTruthy();
      expect(ask.body.topic).toBe('LEASE_LAW');
      expect(ask.body.mock).toBe(true);

      const history = await request(app)
        .get('/chatbot/history')
        .set('Authorization', `Bearer ${token}`);
      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0].question).toBe('보증금 반환은 어떻게 받나요?');
      expect(history.body[0].mock).toBe(true);
    });

    it('임차인 질문(양도세) → 200 topic TAX', async () => {
      const token = await login(app, ROLES.TENANT, 'kim');
      const ask = await request(app)
        .post('/chatbot/ask')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: '양도소득세 계산 알려주세요' });
      expect(ask.status).toBe(200);
      expect(ask.body.topic).toBe('TAX');
      expect(ask.body.mock).toBe(true);
    });

    it('인증 없이 호출 → 401', async () => {
      const r = await request(app)
        .post('/chatbot/ask')
        .send({ question: '보증금?' });
      expect(r.status).toBe(401);
    });
  });

  describe('OCR /ocr', () => {
    it('marketPrice 200,000,000 → DANGER + ownerMasked 마스킹 + history 반영', async () => {
      const token = await login(app, ROLES.LANDLORD, 'hong');
      const reg = await request(app)
        .post('/ocr/registry')
        .set('Authorization', `Bearer ${token}`)
        .send({ marketPrice: 200_000_000 });
      expect(reg.status).toBe(200);
      expect(reg.body.safetyGrade).toBe('DANGER');
      expect(reg.body.ownerMasked).toBe('######-*******');
      expect(reg.body.rrnMasked).toBe(true);
      expect(reg.body.mock).toBe(true);
      expect(reg.body.id).toBeTruthy();

      const history = await request(app)
        .get('/ocr/history')
        .set('Authorization', `Bearer ${token}`);
      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0].safetyGrade).toBe('DANGER');
      expect(history.body[0].ownerMasked).toBe('######-*******');
    });

    it('marketPrice 400,000,000 → SAFE', async () => {
      const token = await login(app, ROLES.LANDLORD, 'hong');
      const reg = await request(app)
        .post('/ocr/registry')
        .set('Authorization', `Bearer ${token}`)
        .send({ marketPrice: 400_000_000 });
      expect(reg.status).toBe(200);
      expect(reg.body.safetyGrade).toBe('SAFE');
    });

    it('marketPrice 없음 → CAUTION', async () => {
      const token = await login(app, ROLES.LANDLORD, 'hong');
      const reg = await request(app)
        .post('/ocr/registry')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(reg.status).toBe(200);
      expect(reg.body.safetyGrade).toBe('CAUTION');
    });

    it('응답 JSON 문자열에 13자리 주민번호 패턴이 0건', async () => {
      const token = await login(app, ROLES.LANDLORD, 'hong');
      const reg = await request(app)
        .post('/ocr/registry')
        .set('Authorization', `Bearer ${token}`)
        .send({ marketPrice: 300_000_000 });
      expect(reg.status).toBe(200);
      expect(RRN_PATTERN.test(JSON.stringify(reg.body))).toBe(false);

      // history 응답에도 평문 주민번호가 없어야 한다.
      const history = await request(app)
        .get('/ocr/history')
        .set('Authorization', `Bearer ${token}`);
      expect(RRN_PATTERN.test(JSON.stringify(history.body))).toBe(false);
    });

    it('인증 없이 호출 → 401', async () => {
      const r = await request(app).post('/ocr/registry').send({ marketPrice: 100 });
      expect(r.status).toBe(401);
    });
  });

  describe('판례 /precedents', () => {
    it('검색 → 200 precedents 배열 + mock', async () => {
      const token = await login(app, ROLES.LANDLORD, 'hong');
      const r = await request(app)
        .post('/precedents/search')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: '보증금 반환' });
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.precedents)).toBe(true);
      expect(r.body.precedents.length).toBeGreaterThan(0);
      expect(r.body.mock).toBe(true);
    });

    it('인증 없이 호출 → 401', async () => {
      const r = await request(app)
        .post('/precedents/search')
        .send({ query: '보증금' });
      expect(r.status).toBe(401);
    });
  });
});
