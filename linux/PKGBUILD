# Maintainer: donniedice <donniedice@protonmail.com>

pkgname=protondrive-linux
pkgver=1.0.0
pkgrel=1
pkgdesc="ProtonDrive Linux GUI Client - Unofficial desktop client for ProtonDrive"
arch=('any')
url="https://github.com/donniedice/protondrive-linux"
license=('GPL3')
depends=('python' 'rclone' 'tk')
makedepends=('python-setuptools')
source=("$pkgname-$pkgver.tar.gz::$url/archive/v$pkgver.tar.gz")
sha256sums=('SKIP')

build() {
    cd "$pkgname-$pkgver"
    python setup.py build
}

package() {
    cd "$pkgname-$pkgver"
    python setup.py install --root="$pkgdir" --optimize=1
    
    # Install desktop file
    install -Dm644 protondrive-linux.desktop "$pkgdir/usr/share/applications/protondrive-linux.desktop"
    
    # Install icon
    install -Dm644 icons/protondrive.png "$pkgdir/usr/share/pixmaps/protondrive.png"
}