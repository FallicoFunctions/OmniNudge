import './styles.css';
import { bootstrapRuntime } from './app/bootstrapRuntime';

void bootstrapRuntime().catch((error) => {
  console.error('Main Stage startup failed', error);
});
