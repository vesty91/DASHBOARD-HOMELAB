variable "APP_VERSION" {
  default = "1.3.0"
}

variable "REGISTRY" {
  default = "dashboard-homelab"
}

group "default" {
  targets = ["web", "worker", "realtime", "migrate"]
}

target "defaults" {
  context = "."
  dockerfile = "Dockerfile"
  args = {
    APP_VERSION = APP_VERSION
  }
}

target "web" {
  inherits = ["defaults"]
  target = "web"
  tags = ["${REGISTRY}/web:${APP_VERSION}"]
}

target "worker" {
  inherits = ["defaults"]
  target = "worker"
  tags = ["${REGISTRY}/worker:${APP_VERSION}"]
}

target "realtime" {
  inherits = ["defaults"]
  target = "realtime"
  tags = ["${REGISTRY}/realtime:${APP_VERSION}"]
}

target "migrate" {
  inherits = ["defaults"]
  target = "migrate"
  tags = ["${REGISTRY}/migrate:${APP_VERSION}"]
}
