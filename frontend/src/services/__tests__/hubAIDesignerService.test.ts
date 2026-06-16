import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api';
import { hubAIDesignerService } from '../hubAIDesignerService';

vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

describe('hubAIDesignerService', () => {
  const validationMessage =
    'The AI returned a design that did not meet system rules. Please try again.';
  const rawValidationMessage =
    'ordinary CSS selectors must be scoped to the AI hub root or slot containers';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps backend validation messages for generate failures', async () => {
    vi.mocked(api.post).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 502'), {
        response: {
          status: 502,
          data: {
            message: rawValidationMessage,
          },
        },
      })
    );

    await hubAIDesignerService
      .generateDesign('underreportednews', 'make it clean')
      .catch((error: Error) => {
        expect(error.message).toBe(validationMessage);
        expect(error.message).not.toContain('ordinary CSS selectors');
        expect(error.message).not.toContain('Request failed with status code 502');
      });
  });

  it('maps timeout generate failures without blaming the connection', async () => {
    vi.mocked(api.post).mockRejectedValue(
      Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' })
    );

    await hubAIDesignerService
      .generateDesign('underreportednews', 'make it clean')
      .catch((error: Error) => {
        expect(error.message).toBe('AI design generation timed out. Please try again.');
        expect(error.message).not.toContain('check your connection');
        expect(error.message).not.toContain('Request failed with status code 502');
      });
  });

  it('keeps a concise fallback for network generate failures', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Network Error'));

    await expect(
      hubAIDesignerService.generateDesign('underreportednews', 'make it clean')
    ).rejects.toThrow('AI design generation could not be completed. Please try again.');
  });

  it('preserves successful generate responses', async () => {
    const response = {
      data: {
        id: 42,
        name: 'Design #1',
        html_content: '<div class="hub-custom-page"></div>',
        prompt: 'make it clean',
        message: 'Design generated. Use the activate endpoint to publish it.',
      },
    };
    vi.mocked(api.post).mockResolvedValue(response);

    await expect(
      hubAIDesignerService.generateDesign('underreportednews', 'make it clean')
    ).resolves.toEqual(response.data);
  });

  it('maps backend validation messages for chat refinement failures', async () => {
    vi.mocked(api.post).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 502'), {
        response: {
          status: 502,
          data: {
            message: rawValidationMessage,
          },
        },
      })
    );

    await hubAIDesignerService
      .chatRefine(
        'underreportednews',
        42,
        '<div class="hub-custom-page"></div>',
        'make the hero stronger'
      )
      .catch((error: Error) => {
        expect(error.message).toBe(validationMessage);
        expect(error.message).not.toContain('ordinary CSS selectors');
        expect(error.message).not.toContain('Request failed with status code 502');
      });
  });

  it('maps timeout chat refinement failures without blaming the connection', async () => {
    vi.mocked(api.post).mockRejectedValue(
      Object.assign(new Error('context deadline exceeded'), {
        response: {
          status: 502,
          data: {
            message: 'gemini api call: context deadline exceeded',
          },
        },
      })
    );

    await hubAIDesignerService
      .chatRefine(
        'underreportednews',
        42,
        '<div class="hub-custom-page"></div>',
        'make the hero stronger'
      )
      .catch((error: Error) => {
        expect(error.message).toBe('AI design refinement timed out. Please try again.');
        expect(error.message).not.toContain('check your connection');
        expect(error.message).not.toContain('Request failed with status code 502');
      });
  });

  it('keeps a concise fallback for network chat refinement failures', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Network Error'));

    await expect(
      hubAIDesignerService.chatRefine(
        'underreportednews',
        42,
        '<div class="hub-custom-page"></div>',
        'make the hero stronger'
      )
    ).rejects.toThrow('AI design refinement could not be completed. Please try again.');
  });
});
