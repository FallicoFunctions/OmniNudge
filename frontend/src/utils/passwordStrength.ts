// FORM-5: Password strength calculator
export interface PasswordStrength {
  score: number; // 0-4
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  feedback: string[];
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const feedback: string[] = [];

  // Length check
  if (password.length >= 8) {
    score++;
  } else if (password.length > 0) {
    feedback.push('At least 8 characters');
  }

  // Uppercase and lowercase check
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else if (password.length > 0) {
    feedback.push('Mix of uppercase and lowercase');
  }

  // Number check
  if (/\d/.test(password)) {
    score++;
  } else if (password.length > 0) {
    feedback.push('At least one number');
  }

  // Special character check
  if (/[^a-zA-Z0-9]/.test(password)) {
    score++;
  } else if (password.length > 0) {
    feedback.push('At least one special character (!@#$%^&*)');
  }

  const labels: PasswordStrength['label'][] = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']; // red, orange, yellow, lime, green

  return {
    score,
    label: labels[score],
    color: colors[score],
    feedback,
  };
}
