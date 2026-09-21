import UIKit
import AVFoundation

/// Full-screen native scanner UI.
///
///   camera (plain live preview, NO detection)  ->  capture  ->  the still is analysed
///   -> real corners drawn on the photo + "مسح"  ->  scan  ->  finished page
///
/// If no document is found the user sees a clear message and can only retake the photo; a
/// rectangle is never invented.
final class DocumentScannerViewController: UIViewController, AVCapturePhotoCaptureDelegate {

    enum Result {
        case scanned(UIImage)
        case cancelled
        case failed(String)
    }

    private enum State {
        case camera, capturing, analyzing, review, noDocument, scanning
    }

    /// Set by the plugin. Called exactly once.
    var onFinish: ((Result) -> Void)?

    // MARK: Strings (the app language is chosen inside the app, not by the device)

    private struct Strings {
        let hint: String
        let capture: String
        let back: String
        let scan: String
        let retake: String
        let noDocument: String
        let noDocumentHint: String
        let analyzing: String
        let scanning: String
        let cameraDeniedTitle: String
        let cameraDeniedMessage: String
        let openSettings: String
        let cancel: String
        let cameraFailed: String

        static func make(_ language: String) -> Strings {
            if language.hasPrefix("ar") {
                return Strings(
                    hint: "وجّه الكاميرا نحو المستند ثم اضغط التقاط",
                    capture: "التقاط", back: "رجوع", scan: "مسح", retake: "إعادة التصوير",
                    noDocument: "لم نتمكن من اكتشاف المستند",
                    noDocumentHint: "تأكد أن المستند كاملًا داخل الصورة وبإضاءة جيدة، ثم أعد التصوير.",
                    analyzing: "جارٍ تحليل الصورة…", scanning: "جارٍ المسح…",
                    cameraDeniedTitle: "الكاميرا غير مسموحة",
                    cameraDeniedMessage: "فعّل الكاميرا للتطبيق من إعدادات iPhone لتتمكن من مسح المستندات.",
                    openSettings: "فتح الإعدادات", cancel: "إلغاء",
                    cameraFailed: "تعذّر تشغيل الكاميرا"
                )
            }
            return Strings(
                hint: "Point the camera at the document, then tap capture",
                capture: "Capture", back: "Back", scan: "Scan", retake: "Retake",
                noDocument: "We couldn't detect the document",
                noDocumentHint: "Make sure the whole document is in the photo with good light, then retake.",
                analyzing: "Analysing the photo…", scanning: "Scanning…",
                cameraDeniedTitle: "Camera access is off",
                cameraDeniedMessage: "Turn the camera on for this app in iPhone Settings to scan documents.",
                openSettings: "Open Settings", cancel: "Cancel",
                cameraFailed: "The camera could not start"
            )
        }
    }

    private let strings: Strings

    // MARK: Camera

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.techsnds.islamicelite.docscan.session")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var sessionConfigured = false

    // MARK: State

    private var state: State = .camera
    private var capturedImage: UIImage?
    private var detectedQuad: DetectedQuad?
    private var didFinish = false

    // MARK: Views

    private let imageView = UIImageView()
    private let dimView = UIView()
    private let polygonLayer = CAShapeLayer()
    private var cornerLayers: [CAShapeLayer] = []
    private let backButton = UIButton(type: .system)
    private let hintLabel = UILabel()
    private let captureButton = UIButton(type: .custom)
    private let scanButton = UIButton(type: .system)
    private let retakeButton = UIButton(type: .system)
    private let messageLabel = UILabel()
    private let subMessageLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let statusLabel = UILabel()

    init(language: String) {
        self.strings = Strings.make(language)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if session.isRunning { session.stopRunning() }
    }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .portrait }

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        // The layout below is left/right exact (the "مسح" button must be on the LEFT), so it must
        // not be mirrored by the app's right-to-left language.
        view.semanticContentAttribute = .forceLeftToRight

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer

        buildInterface()
        applyState(.camera)

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appWillResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if state == .camera { startCamera() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopCamera()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        layoutInterface()
    }

    @objc private func appWillResignActive() { stopCamera() }

    @objc private func appDidBecomeActive() {
        if state == .camera, viewIfLoaded?.window != nil { startCamera() }
    }

    // MARK: Interface

    private func buildInterface() {
        imageView.contentMode = .scaleAspectFit
        imageView.backgroundColor = .black
        imageView.isHidden = true
        view.addSubview(imageView)

        dimView.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        dimView.isHidden = true
        view.addSubview(dimView)

        polygonLayer.strokeColor = UIColor(red: 0.20, green: 0.85, blue: 0.50, alpha: 1).cgColor
        polygonLayer.fillColor = UIColor(red: 0.20, green: 0.85, blue: 0.50, alpha: 0.18).cgColor
        polygonLayer.lineWidth = 3
        polygonLayer.lineJoin = .round
        polygonLayer.isHidden = true
        view.layer.addSublayer(polygonLayer)
        for _ in 0..<4 {
            let dot = CAShapeLayer()
            dot.fillColor = UIColor.white.cgColor
            dot.strokeColor = UIColor(red: 0.20, green: 0.85, blue: 0.50, alpha: 1).cgColor
            dot.lineWidth = 3
            dot.isHidden = true
            view.layer.addSublayer(dot)
            cornerLayers.append(dot)
        }

        backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backButton.tintColor = .white
        backButton.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        backButton.layer.cornerRadius = 22
        backButton.accessibilityLabel = strings.back
        backButton.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        view.addSubview(backButton)

        hintLabel.text = strings.hint
        hintLabel.textColor = .white
        hintLabel.font = .systemFont(ofSize: 15, weight: .medium)
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 2
        hintLabel.layer.shadowColor = UIColor.black.cgColor
        hintLabel.layer.shadowOpacity = 0.6
        hintLabel.layer.shadowRadius = 3
        hintLabel.layer.shadowOffset = .zero
        view.addSubview(hintLabel)

        captureButton.backgroundColor = .white
        captureButton.layer.cornerRadius = 35
        captureButton.layer.borderWidth = 4
        captureButton.layer.borderColor = UIColor(white: 1, alpha: 0.45).cgColor
        captureButton.accessibilityLabel = strings.capture
        captureButton.addTarget(self, action: #selector(captureTapped), for: .touchUpInside)
        view.addSubview(captureButton)

        styleActionButton(scanButton, title: strings.scan, filled: true)
        scanButton.addTarget(self, action: #selector(scanTapped), for: .touchUpInside)
        view.addSubview(scanButton)

        styleActionButton(retakeButton, title: strings.retake, filled: false)
        retakeButton.addTarget(self, action: #selector(retakeTapped), for: .touchUpInside)
        view.addSubview(retakeButton)

        messageLabel.text = strings.noDocument
        messageLabel.textColor = .white
        messageLabel.font = .systemFont(ofSize: 20, weight: .bold)
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0
        view.addSubview(messageLabel)

        subMessageLabel.text = strings.noDocumentHint
        subMessageLabel.textColor = UIColor(white: 1, alpha: 0.8)
        subMessageLabel.font = .systemFont(ofSize: 15)
        subMessageLabel.textAlignment = .center
        subMessageLabel.numberOfLines = 0
        view.addSubview(subMessageLabel)

        spinner.color = .white
        spinner.hidesWhenStopped = true
        view.addSubview(spinner)

        statusLabel.textColor = .white
        statusLabel.font = .systemFont(ofSize: 15, weight: .medium)
        statusLabel.textAlignment = .center
        view.addSubview(statusLabel)
    }

    private func styleActionButton(_ button: UIButton, title: String, filled: Bool) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        button.layer.cornerRadius = 26
        if filled {
            button.backgroundColor = UIColor(red: 0.20, green: 0.75, blue: 0.45, alpha: 1)
            button.setTitleColor(.white, for: .normal)
        } else {
            button.backgroundColor = UIColor.white.withAlphaComponent(0.18)
            button.setTitleColor(.white, for: .normal)
        }
    }

    private func layoutInterface() {
        let bounds = view.bounds
        let safe = view.safeAreaInsets
        previewLayer?.frame = bounds
        imageView.frame = bounds
        dimView.frame = bounds

        backButton.frame = CGRect(x: 16, y: safe.top + 10, width: 44, height: 44)
        hintLabel.frame = CGRect(x: 72, y: safe.top + 8, width: bounds.width - 144, height: 48)

        let bottomY = bounds.height - safe.bottom - 96
        captureButton.frame = CGRect(x: (bounds.width - 70) / 2, y: bottomY, width: 70, height: 70)

        // "مسح" is on the LEFT, the secondary action on the RIGHT.
        let buttonWidth = (bounds.width - 16 * 2 - 12) / 2
        scanButton.frame = CGRect(x: 16, y: bounds.height - safe.bottom - 86, width: buttonWidth, height: 52)
        if state == .noDocument {
            // Only one action exists here (retake): full width, and no rectangle is drawn.
            retakeButton.frame = CGRect(x: 32, y: bounds.height - safe.bottom - 86, width: bounds.width - 64, height: 52)
        } else {
            retakeButton.frame = CGRect(x: 16 + buttonWidth + 12, y: bounds.height - safe.bottom - 86, width: buttonWidth, height: 52)
        }

        messageLabel.frame = CGRect(x: 24, y: bounds.height * 0.36, width: bounds.width - 48, height: 60)
        subMessageLabel.frame = CGRect(x: 32, y: messageLabel.frame.maxY + 8, width: bounds.width - 64, height: 70)
        spinner.center = CGPoint(x: bounds.midX, y: bounds.midY - 16)
        statusLabel.frame = CGRect(x: 24, y: spinner.frame.maxY + 12, width: bounds.width - 48, height: 24)

        if state == .review { drawQuad() }
    }

    private func applyState(_ newState: State) {
        state = newState
        let camera = (newState == .camera || newState == .capturing)
        let photoVisible = (newState == .analyzing || newState == .review || newState == .noDocument || newState == .scanning)

        previewLayer?.isHidden = !camera
        imageView.isHidden = !photoVisible
        dimView.isHidden = !(newState == .noDocument)
        hintLabel.isHidden = !(newState == .camera)
        captureButton.isHidden = !camera
        captureButton.isEnabled = (newState == .camera)
        captureButton.alpha = newState == .capturing ? 0.5 : 1

        let showActions = (newState == .review)
        scanButton.isHidden = !showActions
        retakeButton.isHidden = !(newState == .review || newState == .noDocument)
        view.setNeedsLayout()

        messageLabel.isHidden = !(newState == .noDocument)
        subMessageLabel.isHidden = !(newState == .noDocument)

        let busy = (newState == .analyzing || newState == .scanning)
        if busy { spinner.startAnimating() } else { spinner.stopAnimating() }
        statusLabel.isHidden = !busy
        statusLabel.text = newState == .scanning ? strings.scanning : strings.analyzing

        let showQuad = (newState == .review || newState == .scanning) && detectedQuad != nil
        polygonLayer.isHidden = !showQuad
        cornerLayers.forEach { $0.isHidden = !showQuad }
        if showQuad { drawQuad() }
    }

    // MARK: Camera session

    private func startCamera() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndRun()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if granted { self.configureAndRun() } else { self.showCameraDenied() }
                }
            }
        default:
            showCameraDenied()
        }
    }

    private func configureAndRun() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if !self.sessionConfigured {
                self.session.beginConfiguration()
                self.session.sessionPreset = .photo
                guard
                    let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                    let input = try? AVCaptureDeviceInput(device: device),
                    self.session.canAddInput(input),
                    self.session.canAddOutput(self.photoOutput)
                else {
                    self.session.commitConfiguration()
                    DispatchQueue.main.async { self.finish(.failed(self.strings.cameraFailed)) }
                    return
                }
                self.session.addInput(input)
                self.session.addOutput(self.photoOutput)
                self.photoOutput.maxPhotoQualityPrioritization = .quality
                self.session.commitConfiguration()
                self.sessionConfigured = true

                do {
                    try device.lockForConfiguration()
                    if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
                    if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
                    device.unlockForConfiguration()
                } catch {
                    // Focus tuning is optional.
                }
            }
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    private func stopCamera() {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if self.session.isRunning { self.session.stopRunning() }
        }
    }

    private func showCameraDenied() {
        let alert = UIAlertController(title: strings.cameraDeniedTitle, message: strings.cameraDeniedMessage, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: strings.openSettings, style: .default) { [weak self] _ in
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            self?.finish(.cancelled)
        })
        alert.addAction(UIAlertAction(title: strings.cancel, style: .cancel) { [weak self] _ in
            self?.finish(.cancelled)
        })
        present(alert, animated: true)
    }

    // MARK: Actions

    @objc private func backTapped() {
        finish(.cancelled)
    }

    /// Used by the plugin's cancel().
    func closeFromPlugin() {
        finish(.cancelled)
    }

    @objc private func captureTapped() {
        guard state == .camera, sessionConfigured, session.isRunning else { return }
        applyState(.capturing)

        let settings = AVCapturePhotoSettings()
        settings.photoQualityPrioritization = .quality
        if let connection = photoOutput.connection(with: .video), connection.isVideoOrientationSupported {
            // The screen is portrait-only, so the photo matches what the preview showed.
            connection.videoOrientation = .portrait
        }
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    @objc private func retakeTapped() {
        capturedImage = nil
        detectedQuad = nil
        imageView.image = nil
        applyState(.camera)
        startCamera()
    }

    @objc private func scanTapped() {
        guard state == .review, let image = capturedImage, let quad = detectedQuad else { return }
        applyState(.scanning)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = DocumentImageProcessor.scan(image, quad: quad)
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let page = result {
                    self.finish(.scanned(page))
                } else {
                    // Could not process: go back to the review so the user can retake.
                    self.applyState(.noDocument)
                }
            }
        }
    }

    // MARK: Capture delegate

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation(), let raw = UIImage(data: data) else {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.applyState(.camera)
            }
            return
        }
        let upright = DocumentImageProcessor.normalizedOrientation(raw)
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.capturedImage = upright
            self.imageView.image = upright
            self.stopCamera() // the preview is no longer needed: release the camera right away
            self.applyState(.analyzing)
            self.analyze(upright)
        }
    }

    // MARK: Detection

    private func analyze(_ image: UIImage) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let quad = DocumentImageProcessor.detectDocument(in: image)
            DispatchQueue.main.async {
                guard let self = self, self.state == .analyzing else { return }
                self.detectedQuad = quad
                self.applyState(quad == nil ? .noDocument : .review)
            }
        }
    }

    private func drawQuad() {
        guard let quad = detectedQuad, let image = imageView.image else { return }
        // Where the aspect-fit photo actually sits inside the view.
        let fitted = AVMakeRect(aspectRatio: image.size, insideRect: imageView.bounds)

        func viewPoint(_ p: CGPoint) -> CGPoint {
            // Vision/Core Image: origin bottom-left. UIKit: origin top-left.
            CGPoint(x: fitted.minX + p.x * fitted.width, y: fitted.minY + (1 - p.y) * fitted.height)
        }

        let pts = quad.points.map(viewPoint)
        let path = UIBezierPath()
        path.move(to: pts[0])
        for p in pts.dropFirst() { path.addLine(to: p) }
        path.close()
        polygonLayer.path = path.cgPath

        for (index, p) in pts.enumerated() where index < cornerLayers.count {
            cornerLayers[index].path = UIBezierPath(ovalIn: CGRect(x: p.x - 9, y: p.y - 9, width: 18, height: 18)).cgPath
        }
    }

    // MARK: Finish

    private func finish(_ result: Result) {
        guard !didFinish else { return }
        didFinish = true
        stopCamera()
        onFinish?(result)
        onFinish = nil
    }
}
