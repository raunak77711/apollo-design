// Groups are logical containers; their children render as normal top-level
// elements. The group frame itself is a transparent bounding box shown when
// selected, so nothing needs to be drawn here.
export default function GroupElement() {
  return <div className="w-full h-full" />;
}
