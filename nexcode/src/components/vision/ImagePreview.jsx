/**
 * @param {{image: {dataUrl?: string, name?: string} | null}} props
 */
export default function ImagePreview({ image }) {
  if (!image?.dataUrl) {
    return null;
  }
  return <img className="image-preview" src={image.dataUrl} alt={image.name || 'Attached image'} />;
}
