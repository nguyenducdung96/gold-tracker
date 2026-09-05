export function PremiumCard({ worldVndPerLuong, usdVnd }: { worldVndPerLuong: number | null; usdVnd: number | null }) {
  if (!worldVndPerLuong || !usdVnd) return null;
  return <section className="card premiumCard">
    <div><div className="eyebrow">GIÁ THẾ GIỚI QUY ĐỔI</div><div className="premiumValue">{Math.round(worldVndPerLuong).toLocaleString("vi-VN")} đ/lượng</div></div>
    <div className="sourceBox"><span>USD/VND: {usdVnd.toLocaleString("vi-VN", {maximumFractionDigits:0})}</span><span>1 lượng = 37,5g</span><span>1 oz = 31,1034768g</span></div>
  </section>;
}
