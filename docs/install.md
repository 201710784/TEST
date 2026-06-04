update 확인 테스트용



================================================================

Ubuntu 22 버전 설치 기준



1\. K8S - 단일노드 : Master Node + Work Node

2\. sotrage class (단일 NFS 서버)

3\. local registry (podman-compose 구동)

================================================================





\--------------------------------------

SSH 설정

\--------------------------------------



apt update

apt install openssh-server

vi /etc/ssh/sshd\_config

PermitRoot yes



systemctl restart ssh

systemctl status ssh



ufw disable





\--------------------------------------

mstr 유저 생성

\--------------------------------------



groupadd mstr

useradd mstr -g mstr



mkdir /home/mstr

chown mstr:mstr /home/mstr

cp -r /etc/skel/. /home/mstr/

chown -R mstr:mstr /home/mstr/

usermod -s /bin/bash mstr







\--------------------------------------

/etc/sysctl.conf

\--------------------------------------



\# 1. virtual memory

vm.max\_map\_count=262144



\# 2. 네트워크 트래픽 향상

net.core.somaxconn=1024

net.ipv4.tcp\_max\_syn\_backlog=2048

net.ipv4.ip\_local\_port\_range=1024 65535



\# 3. 브릿지 네트워크 (K8s 필수)

net.bridge.bridge-nf-call-iptables=1

net.bridge.bridge-nf-call-ip6tables=1



\# 4. 파일 핸들러

fs.file-max=65536

fs.nr\_open=1048576



\# 5. 스왑 억제

vm.swappiness=1







\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*

\# 즉시 설정 반영

sysctl --system







\--------------------------------------

추가 설정

\--------------------------------------



sudo swapoff -a

sudo sed -i '/ swap / s/^\\(.\*\\)$/#\\1/g' /etc/fstab





\# 모듈 로드 설정 파일 생성

cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf

overlay

br\_netfilter

EOF



\# 즉시 로드

sudo modprobe overlay

sudo modprobe br\_netfilter



\# sysctl 설정 (IP 포워딩 포함)

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf

net.bridge.bridge-nf-call-iptables  = 1

net.bridge.bridge-nf-call-ip6tables = 1

net.ipv4.ip\_forward                 = 1

EOF







\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*

\# 즉시 설정 반영

sysctl --system





=====================================================

contaierd 설치 (k8s 1.3x 는 docker 아닌 contaierd 기반

=====================================================



sudo apt update

sudo apt install -y containerd



sudo mkdir -p /etc/containerd

containerd config default | sudo tee /etc/containerd/config.toml









=============================================

podman 및 cri-o 설치

================================================



\# 필수 패키지 설치

sudo apt update

sudo apt install -y software-properties-common curl apt-transport-https ca-certificates podman



\# 저장소 키 설정 및 리스트 추가

K8S\_VER=v1.31

sudo mkdir -p /etc/apt/keyrings



\# CRI-O 저장소

curl -fsSL https://pkgs.k8s.io/addons:/cri-o:/stable:/$K8S\_VER/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/cri-o-apt-keyring.gpg

echo "deb \[signed-by=/etc/apt/keyrings/cri-o-apt-keyring.gpg] https://pkgs.k8s.io/addons:/cri-o:/stable:/$K8S\_VER/deb/ /" | sudo tee /etc/apt/sources.list.d/cri-o.list



\# CRI-O 설치

sudo apt update

sudo apt install -y cri-o

sudo systemctl enable crio --now





================================================

k8s 컴포넌트 설치

================================================



\# K8s 저장소 추가

curl -fsSL https://pkgs.k8s.io/core:/stable:/$K8S\_VER/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb \[signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/$K8S\_VER/deb/ /" | sudo tee /etc/apt/sources.list.d/kubernetes.list



\# 설치 (1.31 버전 중 최신 패키지 설치)

sudo apt update

sudo apt install -y kubelet kubeadm kubectl

sudo apt-mark hold kubelet kubeadm kubectl







================================================

클러스터 초기화 및 단일 노드 설정

================================================



\# conntrack 설치



sudo apt update

sudo apt install -y conntrack





\# 클러스터 초기화

sudo kubeadm init --pod-network-cidr=192.168.0.0/16 --cri-socket=unix:///var/run/crio/crio.sock



\# 관리자 설정

mkdir -p $HOME/.kube

sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config

sudo chown $(id -u):$(id -g) $HOME/.kube/config



\# 마스터 노드에 Pod 배포 허용 (단일 노드 필수)

kubectl taint nodes --all node-role.kubernetes.io/control-plane-









================================================

Helm v3.19.0 설치

================================================





curl -fsSL -o helm-v3.19.0-linux-amd64.tar.gz https://get.helm.sh/helm-v3.19.0-linux-amd64.tar.gz

tar -zxvf helm-v3.19.0-linux-amd64.tar.gz

sudo mv linux-amd64/helm /usr/local/bin/helm

rm -rf linux-amd64 helm-v3.19.0-linux-amd64.tar.gz









================================================

Calico v3.29.1 (Network Policy) 설치

================================================





kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.1/manifests/tigera-operator.yaml

kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.1/manifests/custom-resources.yaml







================================================

Cert-manager v1.18.0 설치

================================================





helm repo add jetstack https://charts.jetstack.io

helm repo update

helm install cert-manager jetstack/cert-manager \\

&#x20; --namespace cert-manager \\

&#x20; --create-namespace \\

&#x20; --version v1.18.0 \\

&#x20; --set installCRDs=true

&#x20;

&#x20;

================================================

Istio v1.29.2 설치

================================================





curl -L https://istio.io/downloadIstio | ISTIO\_VERSION=1.29.2 sh -

cd istio-1.29.2

export PATH=$PWD/bin:$PATH



\# 데모 프로파일로 설치

istioctl install --set profile=demo -y



\# 기본 네임스페이스에 사이드카 주입 활성화

kubectl label namespace default istio-injection=enabled







===========================================

최종확인

===========================================



\# 노드 상태 (ready 확인)

kubectl get nodes



\# Pod 상태 (Running 혹은 Completed 확인)

kubectl get pods -A



\# Istio 확인

istioctl version



\# Helm 확인

helm version







================================================

NFS-Server

================================================



sudo mkdir -p /mnt/nfs\_share

sudo chown -R nobody:nogroup /mnt/nfs\_share

sudo chmod 777 /mnt/nfs\_share





\# 1. 패키지 설치 (RHEL의 nfs-utils 대응)

sudo apt update

sudo apt install -y nfs-kernel-server





\# 파일 하단에 아래 한 줄만 추가 (기존 내용 있으면 지우세요)

sudo vi /etc/exports



\# 입력할 내용:

/mnt/nfs\_share 10.10.19.0/24(rw,sync,no\_subtree\_check,no\_root\_squash)







\# 4. 설정 반영 및 서비스 시작

sudo exportfs -ra

sudo systemctl restart nfs-kernel-server

sudo systemctl enable nfs-kernel-server





sudo systemctl status nfs-kernel-server





\# 5. 서버 확인

sudo exportfs -v





\# 6. mount



sudo mkdir -p /mnt/cmc

sudo mount -t nfs 10.10.19.160:/mnt/nfs\_share /mnt/cmc

df -h | grep nfs





================================================

NFS CSI 드라이버 설치 (storage class mount 목적)

================================================



kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/deploy/rbac-csi-nfs.yaml

kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/deploy/csi-nfs-driverinfo.yaml



kubectl get csidrivers



\## 컨트롤러 deployment 와 node demonset 실행



kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/deploy/csi-nfs-controller.yaml

kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/deploy/csi-nfs-node.yaml





\# running 확인 (주기적으로 확인하여 running 됨을 확인)

&#x20;

kubectl get pods -n kube-system -l app=csi-nfs-controller

kubectl get pods -n kube-system -l app=csi-nfs-node





\-----------------------------------------

storage class

\-----------------------------------------



\## sc.yaml 파일 생성



apiVersion: storage.k8s.io/v1

kind: StorageClass

metadata:

&#x20; name: nfs-storage

&#x20; annotations:

&#x20;   storageclass.kubernetes.io/is-default-class: "true"

allowVolumeExpansion: true

mountOptions:

&#x20; - nfsvers=4.1

parameters:

&#x20; server: 10.10.19.160

&#x20; share: /mnt/nfs\_share

&#x20; subDir: k8s/${pvc.metadata.namespace}/${pvc.metadata.name}

provisioner: nfs.csi.k8s.io

reclaimPolicy: Delete

volumeBindingMode: Immediate







\*\* 적용

kubectl apply -f sc.yaml

kubectl get sc









\-----------------------------------------

Container registry 설치

\-----------------------------------------



\## 아래 10.10.19.160 은 설치 대상 리눅스 IP 에 맞게 변경



sudo apt update

sudo apt install -y podman apache2-utils

sudo apt install -y python3-pip

sudo pip3 install podman-compose

podman-compose --version







\# 2. 작업 디렉토리 생성

mkdir \~/my-registry \&\& cd \~/my-registry

mkdir -p /opt/registry/data /opt/registry/auth /opt/registry/certs







\# 1. 인증서 생성 (도메인 대신 IP 사용)

sudo openssl req -newkey rsa:4096 -nodes -sha256 -keyout /opt/registry/certs/domain.key \\

\-x509 -days 365 -out /opt/registry/certs/domain.crt \\

\-subj "/C=KR/ST=Seoul/L=Seoul/O=MOCOCO/CN=10.10.19.160"





\# 2. 관리자 계정 생성 (ID: admin, 패스워드는 입력 시 설정)

sudo htpasswd -Bc /opt/registry/auth/htpasswd admin





\*\* PODMAN YML

\-------------------------

vi podman-compose.yml

\-------------------------





services:

&#x20; registry:

&#x20;   image: registry:2

&#x20;   container\_name: local-registry

&#x20;   restart: always

&#x20;   ports:

&#x20;     - "5000:5000"

&#x20;   environment:

&#x20;     REGISTRY\_HTTP\_ADDR: 0.0.0.0:5000

&#x20;     REGISTRY\_HTTP\_TLS\_CERTIFICATE: /certs/domain.crt

&#x20;     REGISTRY\_HTTP\_TLS\_KEY: /certs/domain.key

&#x20;     REGISTRY\_AUTH: htpasswd

&#x20;     REGISTRY\_AUTH\_HTPASSWD\_REALM: "Registry Realm"

&#x20;     REGISTRY\_AUTH\_HTPASSWD\_PATH: /auth/htpasswd

&#x20;     REGISTRY\_STORAGE\_DELETE\_ENABLED: "true"

&#x20;   volumes:

&#x20;     - /opt/registry/data:/var/lib/registry

&#x20;     - /opt/registry/auth:/auth:ro

&#x20;     - /opt/registry/certs:/certs:ro



&#x20; ui:

&#x20;   image: joxit/docker-registry-ui:latest

&#x20;   container\_name: registry-ui

&#x20;   restart: always

&#x20;   ports:

&#x20;     - "8444:80"

&#x20;   environment:

&#x20;     - REGISTRY\_URL=https://10.10.19.160:5000

&#x20;     - SINGLE\_REGISTRY=true

&#x20;     - DELETE\_IMAGES=true

&#x20;

\---------------------------------





sudo cp /opt/registry/certs/domain.crt /usr/local/share/ca-certificates/registry.crt

sudo update-ca-certificates

sudo systemctl restart containerd # 또는 재부팅





\---------------------------------



podman-compose up -d

sudo sed -i 's/"cniVersion": "1.0.0"/"cniVersion": "0.4.0"/g' /etc/cni/net.d/my-registry\_default.conflist

podman ps



\---------------------------------





\# 레지스트리 주소에 맞는 디렉토리 생성

sudo mkdir -p /etc/containers/certs.d/10.10.19.160:5000



\# 아까 만든 인증서를 해당 위치로 복사

sudo cp /opt/registry/certs/domain.crt /etc/containers/certs.d/10.10.19.160:5000/ca.crt



\# CRI-O 설정 업데이트 및 재시작

sudo systemctl restart crio



\# 설정 업데이트

vi /etc/containers/registries.conf



\[\[registry]]

location = "10.10.19.160:5000"

insecure = true





\------------------

systemctl restart crio





\# push test

podman pull hello-world

podman tag hello-world 10.10.19.160:5000/hello-test:v1



podman login 10.10.19.160:5000 -u admin

podman push 10.10.19.160:5000/hello-test:v1



\# push 확인

curl -u admin -k https://10.10.19.160:5000/v2/\_catalog

