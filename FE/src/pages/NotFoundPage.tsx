import { Link } from 'react-router';
import { ArrowLeft, PackageSearch } from 'lucide-react';
export default function NotFoundPage() {
  return (
    <section className="card empty-state">
      <PackageSearch size={36} />
      <h1>페이지를 찾을 수 없어요</h1>
      <p>주소를 확인하거나 홈으로 돌아가 주세요.</p>
      <Link className="button button-primary" to="/">
        <ArrowLeft size={18} />
        홈으로 돌아가기
      </Link>
    </section>
  );
}
