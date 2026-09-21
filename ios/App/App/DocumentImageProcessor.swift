import UIKit
import Vision
import CoreImage

/// The four corners of a detected document, normalised 0...1 in the IMAGE's own space with the
/// origin at the BOTTOM-LEFT (Vision's convention, which is also Core Image's).
struct DetectedQuad {
    var topLeft: CGPoint
    var topRight: CGPoint
    var bottomRight: CGPoint
    var bottomLeft: CGPoint

    var points: [CGPoint] { [topLeft, topRight, bottomRight, bottomLeft] }
}

/// Pure image work for the scanner: orientation, rectangle detection, perspective correction and
/// enhancement. No UI, so it can be reasoned about (and unit tested on a Mac) on its own.
enum DocumentImageProcessor {

    // MARK: - Orientation

    /// Redraws the image so its pixels are upright (`.up`). Photos from the camera carry an EXIF
    /// orientation; detection and Core Image both need real, upright pixels.
    static func normalizedOrientation(_ image: UIImage) -> UIImage {
        if image.imageOrientation == .up, image.cgImage != nil { return image }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = image.size
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    // MARK: - Detection

    /// Finds the document in a captured (upright) photo, or returns nil. Two passes: strict first,
    /// then a more permissive one. Every candidate is validated (inside the image, convex, sensible
    /// area and shape, not simply the whole frame) and the best one is chosen by confidence x size.
    static func detectDocument(in image: UIImage) -> DetectedQuad? {
        guard let cgImage = image.cgImage else { return nil }
        let imageSize = CGSize(width: cgImage.width, height: cgImage.height)

        let passes: [(confidence: Float, minSize: Float, minAspect: Float, tolerance: Float)] = [
            (0.55, 0.12, 0.25, 30),
            (0.30, 0.08, 0.15, 45)
        ]

        for pass in passes {
            let request = VNDetectRectanglesRequest()
            request.maximumObservations = 10
            request.minimumConfidence = pass.confidence
            request.minimumSize = pass.minSize
            request.minimumAspectRatio = pass.minAspect
            request.maximumAspectRatio = 1.0
            request.quadratureTolerance = pass.tolerance

            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continue
            }

            let observations = request.results ?? []
            var best: (quad: DetectedQuad, score: Double)?
            for observation in observations {
                let quad = DetectedQuad(
                    topLeft: observation.topLeft,
                    topRight: observation.topRight,
                    bottomRight: observation.bottomRight,
                    bottomLeft: observation.bottomLeft
                )
                guard isPlausibleDocument(quad, imageSize: imageSize) else { continue }
                let score = Double(observation.confidence) * sqrt(polygonArea(quad.points))
                if best == nil || score > best!.score {
                    best = (quad, score)
                }
            }
            if let found = best { return found.quad }
        }
        return nil
    }

    /// Geometry validation. A "document" must be a convex quadrilateral fully inside the photo,
    /// covering a meaningful part of it, with a believable aspect ratio, and must NOT be just the
    /// four corners of the image.
    static func isPlausibleDocument(_ quad: DetectedQuad, imageSize: CGSize) -> Bool {
        let pts = quad.points
        // Inside the image (tiny overshoot tolerated).
        for p in pts where p.x < -0.01 || p.x > 1.01 || p.y < -0.01 || p.y > 1.01 { return false }

        let area = polygonArea(pts)
        if area < 0.08 || area > 0.97 { return false }
        if !isConvex(pts) { return false }

        // Side lengths in pixels.
        func dist(_ a: CGPoint, _ b: CGPoint) -> Double {
            let dx = Double((a.x - b.x) * imageSize.width)
            let dy = Double((a.y - b.y) * imageSize.height)
            return (dx * dx + dy * dy).squareRoot()
        }
        let top = dist(quad.topLeft, quad.topRight)
        let bottom = dist(quad.bottomLeft, quad.bottomRight)
        let left = dist(quad.topLeft, quad.bottomLeft)
        let right = dist(quad.topRight, quad.bottomRight)
        let width = (top + bottom) / 2
        let height = (left + right) / 2
        if width < 40 || height < 40 { return false }
        let ratio = min(width, height) / max(width, height)
        if ratio < 0.15 { return false }
        // Opposite sides of a photographed rectangle stay within a reasonable perspective ratio.
        if min(top, bottom) / max(top, bottom) < 0.35 { return false }
        if min(left, right) / max(left, right) < 0.35 { return false }

        // The whole frame is not a detection.
        let corners = [CGPoint(x: 0, y: 1), CGPoint(x: 1, y: 1), CGPoint(x: 1, y: 0), CGPoint(x: 0, y: 0)]
        let tolerance: CGFloat = 0.025
        var nearFrame = 0
        for (p, c) in zip(pts, corners) where abs(p.x - c.x) < tolerance && abs(p.y - c.y) < tolerance {
            nearFrame += 1
        }
        if nearFrame == 4 { return false }
        return true
    }

    private static func polygonArea(_ p: [CGPoint]) -> Double {
        var sum = 0.0
        for i in 0..<p.count {
            let a = p[i], b = p[(i + 1) % p.count]
            sum += Double(a.x * b.y - b.x * a.y)
        }
        return abs(sum) / 2
    }

    private static func isConvex(_ p: [CGPoint]) -> Bool {
        var sign = 0
        for i in 0..<p.count {
            let a = p[i], b = p[(i + 1) % p.count], c = p[(i + 2) % p.count]
            let cross = Double((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
            if abs(cross) < 1e-9 { return false }
            let s = cross > 0 ? 1 : -1
            if sign == 0 { sign = s } else if s != sign { return false }
        }
        return true
    }

    // MARK: - Scan (perspective correction + enhancement)

    /// Turns the photo + the detected quad into the final flat, cropped, enhanced page.
    /// Uses EXACTLY the corners that were detected (and shown to the user).
    static func scan(_ image: UIImage, quad: DetectedQuad, maxSide: CGFloat = 2600) -> UIImage? {
        guard let cgImage = image.cgImage else { return nil }
        let width = CGFloat(cgImage.width)
        let height = CGFloat(cgImage.height)

        func vector(_ p: CGPoint) -> CIVector { CIVector(x: p.x * width, y: p.y * height) }

        guard let correction = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
        correction.setValue(CIImage(cgImage: cgImage), forKey: kCIInputImageKey)
        correction.setValue(vector(quad.topLeft), forKey: "inputTopLeft")
        correction.setValue(vector(quad.topRight), forKey: "inputTopRight")
        correction.setValue(vector(quad.bottomRight), forKey: "inputBottomRight")
        correction.setValue(vector(quad.bottomLeft), forKey: "inputBottomLeft")
        guard var output = correction.outputImage else { return nil }

        // Document enhancement: slightly more contrast/brightness so paper reads clean, then a
        // light luminance sharpen so text edges stay crisp. Colour is kept (receipts, stamps).
        if let controls = CIFilter(name: "CIColorControls") {
            controls.setValue(output, forKey: kCIInputImageKey)
            controls.setValue(1.14, forKey: kCIInputContrastKey)
            controls.setValue(0.03, forKey: kCIInputBrightnessKey)
            controls.setValue(1.0, forKey: kCIInputSaturationKey)
            if let next = controls.outputImage { output = next }
        }
        if let sharpen = CIFilter(name: "CISharpenLuminance") {
            sharpen.setValue(output, forKey: kCIInputImageKey)
            sharpen.setValue(0.45, forKey: kCIInputSharpnessKey)
            if let next = sharpen.outputImage { output = next }
        }

        let extent = output.extent
        guard extent.width > 1, extent.height > 1 else { return nil }

        let context = CIContext(options: nil)
        guard let rendered = context.createCGImage(output, from: extent) else { return nil }
        var result = UIImage(cgImage: rendered, scale: 1, orientation: .up)

        // Keep the file a sensible size for a PDF page.
        let longSide = max(result.size.width, result.size.height)
        if longSide > maxSide {
            let scale = maxSide / longSide
            let target = CGSize(width: (result.size.width * scale).rounded(), height: (result.size.height * scale).rounded())
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = true
            let renderer = UIGraphicsImageRenderer(size: target, format: format)
            result = renderer.image { _ in result.draw(in: CGRect(origin: .zero, size: target)) }
        }
        return result
    }
}
