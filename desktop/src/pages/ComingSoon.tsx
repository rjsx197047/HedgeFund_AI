import styles from './ComingSoon.module.css';

interface ComingSoonProps {
  title: string;
  description: string;
}

function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.badge}>Coming soon</span>
      </header>
      <p className={styles.description}>{description}</p>
    </div>
  );
}

export default ComingSoon;
