export type Lifecycle = {
  name: string;
  start?: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
};
